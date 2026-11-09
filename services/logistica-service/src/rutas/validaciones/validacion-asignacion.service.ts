import { ConflictException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { LotesProduccionClient } from '../../disponibilidad-documental/lotes-produccion.client';
import { ConsultaRecursosRespuesta } from '../../recursos-externos/dto/consulta-recursos.dto';
import { ChoferErpV1, VehiculoErpV1 } from '../../recursos-externos/dto/recursos-logisticos-v1';
import { RecursosLogisticosService } from '../../recursos-externos/recursos-logisticos.service';
import { GuardarRutaDto } from '../dto/guardar-ruta.dto';
import { EstadoRuta } from '../entities/estado-ruta.enum';
import { calcularCarga, validarCapacidad } from './carga';

const ESTADOS_ACTIVOS = [EstadoRuta.PLANIFICADA, EstadoRuta.DESPACHADA];

// Datos que dependen de otros servicios y se consultan antes de abrir la
// transacción, para no retener bloqueos mientras se espera al ERP o a Producción.
export interface DatosExternosAsignacion {
  recursos: ConsultaRecursosRespuesta;
  unidadesPorOrden: Map<string, string | null>;
}

interface ConflictoRecurso {
  recurso: 'VEHICULO' | 'CHOFER';
  idExterno: string;
  motivo: string;
}

function conflictoRecursos(message: string, conflictos: ConflictoRecurso[]) {
  return new ConflictException({ statusCode: 409, codigo: 'CONFLICTO_RECURSOS', message, conflictos });
}

const boletasDe = (dto: GuardarRutaDto) => [...new Set(dto.paradas.flatMap((parada) => parada.boletaIds))];

// Claves de bloqueo por recurso y día; se toman en orden para evitar interbloqueos.
export function clavesBloqueo(dto: Pick<GuardarRutaDto, 'fechaProgramada' | 'vehiculoExternoId' | 'choferExternoId'>): string[] {
  return [
    `rutas:vehiculo:${dto.fechaProgramada}:${dto.vehiculoExternoId}`,
    `rutas:chofer:${dto.fechaProgramada}:${dto.choferExternoId}`,
  ].sort();
}

// ABC-371: disponibilidad de vehículo y chofer, solapamientos y capacidad de
// carga al crear o editar una ruta. Consultar el ERP no reserva el recurso en él.
@Injectable()
export class ValidacionAsignacionService {
  constructor(
    private readonly recursos: RecursosLogisticosService,
    private readonly produccion: LotesProduccionClient,
  ) {}

  async consultarDatosExternos(manager: EntityManager, dto: GuardarRutaDto, authorization: string): Promise<DatosExternosAsignacion> {
    // Datos actuales del ERP o, si falla, su copia de respaldo; sin ninguno, 503.
    const recursos = await this.recursos.consultar({ fecha: dto.fechaProgramada, disponible: null, capacidadMinima: null });
    const ordenes = await manager.query(
      `SELECT DISTINCT solicitud.orden_id::text AS orden_id
         FROM boletas_envio boleta
         INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
        WHERE boleta.id = ANY($1::bigint[])
        ORDER BY 1`,
      [boletasDe(dto)],
    ) as Array<{ orden_id: string }>;
    const unidadesPorOrden = new Map<string, string | null>();
    for (const { orden_id: ordenId } of ordenes) {
      unidadesPorOrden.set(ordenId, await this.unidadDeOrden(ordenId, authorization));
    }
    return { recursos, unidadesPorOrden };
  }

  // Serializa los guardados que usan el mismo vehículo o chofer el mismo día,
  // incluso cuando todavía no existe ninguna fila que bloquear.
  async bloquearRecursos(manager: EntityManager, dto: GuardarRutaDto): Promise<void> {
    for (const clave of clavesBloqueo(dto)) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [clave]);
    }
  }

  async validar(manager: EntityManager, dto: GuardarRutaDto, rutaId: string | null, externos: DatosExternosAsignacion): Promise<void> {
    const vehiculo = this.recurso<VehiculoErpV1>(externos.recursos.vehiculos, dto.vehiculoExternoId, 'VEHICULO', externos.recursos);
    this.recurso<ChoferErpV1>(externos.recursos.choferes, dto.choferExternoId, 'CHOFER', externos.recursos);
    await this.validarSolapamientos(manager, dto, rutaId);

    const boletaIds = boletasDe(dto);
    const items = await manager.query(
      `SELECT item.boleta_id::text AS boleta_id, item.cantidad::text AS cantidad, solicitud.orden_id::text AS orden_id
         FROM boletas_envio_items item
         INNER JOIN boletas_envio boleta ON boleta.id = item.boleta_id
         INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
        WHERE item.boleta_id = ANY($1::bigint[])
        ORDER BY item.boleta_id, item.id`,
      [boletaIds],
    ) as Array<{ boleta_id: string; cantidad: string; orden_id: string }>;
    const carga = calcularCarga(boletaIds, items.map((item) => ({
      boletaId: item.boleta_id,
      cantidad: item.cantidad,
      unidad: externos.unidadesPorOrden.get(item.orden_id) ?? null,
    })));
    validarCapacidad(vehiculo, carga);
  }

  private recurso<T extends VehiculoErpV1 | ChoferErpV1>(lista: T[], id: string, tipo: ConflictoRecurso['recurso'], recursos: ConsultaRecursosRespuesta): T {
    const fuente = recursos.origen === 'ERP' ? 'el ERP' : `la copia de respaldo del ERP (${recursos.sincronizadoEn})`;
    const recurso = lista.find((fila) => fila.idExterno === id);
    const nombre = tipo === 'VEHICULO' ? 'vehículo' : 'chofer';
    if (!recurso) {
      const motivo = `No figura en ${fuente} para ${recursos.fecha}`;
      throw conflictoRecursos(`El ${nombre} ${id} no figura en ${fuente} para ${recursos.fecha}`, [
        { recurso: tipo, idExterno: id, motivo },
      ]);
    }
    if (!recurso.disponible) {
      const motivo = `No está disponible el ${recursos.fecha} según ${fuente}`;
      throw conflictoRecursos(`El ${nombre} ${id} no está disponible el ${recursos.fecha} según ${fuente}`, [
        { recurso: tipo, idExterno: id, motivo },
      ]);
    }
    return recurso;
  }

  private async validarSolapamientos(manager: EntityManager, dto: GuardarRutaDto, rutaId: string | null): Promise<void> {
    const otras = await manager.query(
      `SELECT id::text AS id, vehiculo_externo_id, chofer_externo_id
         FROM rutas
        WHERE fecha_programada = $1
          AND estado = ANY($2::varchar[])
          AND ($3::bigint IS NULL OR id <> $3::bigint)
          AND (vehiculo_externo_id = $4 OR chofer_externo_id = $5)
        ORDER BY id`,
      [dto.fechaProgramada, ESTADOS_ACTIVOS, rutaId, dto.vehiculoExternoId, dto.choferExternoId],
    ) as Array<{ id: string; vehiculo_externo_id: string; chofer_externo_id: string }>;
    const conflictos = otras.flatMap<ConflictoRecurso>((ruta) => [
      ...(ruta.vehiculo_externo_id === dto.vehiculoExternoId ? [{ recurso: 'VEHICULO' as const, idExterno: dto.vehiculoExternoId, motivo: `ruta ${ruta.id}` }] : []),
      ...(ruta.chofer_externo_id === dto.choferExternoId ? [{ recurso: 'CHOFER' as const, idExterno: dto.choferExternoId, motivo: `ruta ${ruta.id}` }] : []),
    ]);
    if (conflictos.length > 0) {
      const detalle = conflictos.map(({ recurso, idExterno, motivo }) =>
        `${recurso === 'VEHICULO' ? 'vehículo' : 'chofer'} ${idExterno} (${motivo})`,
      ).join(', ');
      throw conflictoRecursos(`Recursos ya asignados el ${dto.fechaProgramada}: ${detalle}`, conflictos);
    }
  }

  private async unidadDeOrden(ordenId: string, authorization: string): Promise<string | null> {
    let orden: { producto?: { unidad_producto?: unknown } | null };
    try {
      orden = await this.produccion.consultarOrdenPorId(ordenId, authorization) as typeof orden;
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      const detalle = error instanceof HttpException ? error.message : 'error inesperado';
      throw new ServiceUnavailableException(`No se pudo obtener la unidad de carga de la orden ${ordenId} en Producción: ${detalle}`);
    }
    // Sin receta Producción devuelve producto null: la unidad es desconocida.
    const unidad = orden?.producto?.unidad_producto;
    return typeof unidad === 'string' && unidad.trim() ? unidad.trim() : null;
  }
}
