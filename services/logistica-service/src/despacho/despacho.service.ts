import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { RutaParada } from '../rutas/entities/ruta-parada.entity';
import { Ruta } from '../rutas/entities/ruta.entity';
import { EstadoEntrega } from './estado-entrega.enum';
import { EVENTOS_DESPACHO, EventosDespacho } from './eventos-despacho';
import { estadoRutaSegunEntregas, validarDespacho, validarTransicionEntrega } from './transiciones';

const MAX_BIGINT = BigInt('9223372036854775807');

function idValido(id: string): boolean {
  return /^\d+$/.test(id) && BigInt(id) >= BigInt('1') && BigInt(id) <= MAX_BIGINT;
}

type RutaBloqueada = {
  id: string;
  estado: EstadoRuta;
  fecha_programada: string;
  vehiculo_externo_id: string;
  chofer_externo_id: string;
};
type ParadaBloqueada = { id: string; estado_entrega: EstadoEntrega };
type BoletaRuta = { id: string; estado: EstadoBoleta };

// Una boleta repetida en dos paradas aparece una vez en los mensajes.
function noEmitidas(boletas: BoletaRuta[]): string {
  const unicas = new Map(boletas.filter((b) => b.estado !== EstadoBoleta.EMITIDA).map((b) => [b.id, b.estado]));
  return [...unicas].map(([id, estado]) => `${id} (${estado})`).join(', ');
}

// ABC-376: despacho de la ruta y entrega de cada parada con la máquina de
// estados de ABC-375. Fecha y autor salen del servidor y de la sesión.
@Injectable()
export class DespachoService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(EVENTOS_DESPACHO) private readonly eventos: EventosDespacho,
  ) {}

  despachar(rutaId: string, usuarioId: string, observacion: string | null): Promise<Ruta> {
    if (!idValido(rutaId)) throw new NotFoundException('Ruta no encontrada');
    return this.dataSource.transaction(async (manager) => {
      // El bloqueo de la ruta evita el doble despacho simultáneo.
      const ruta = await this.bloquearRuta(manager, rutaId);
      const paradas = await this.bloquearParadas(manager, rutaId);
      validarDespacho(ruta.estado, paradas.map((parada) => parada.estado_entrega));
      if (!ruta.vehiculo_externo_id?.trim() || !ruta.chofer_externo_id?.trim()) {
        throw new ConflictException('La ruta debe tener vehículo y chofer asignados para despacharse');
      }

      // Las boletas se bloquean para que no se anulen mientras se despacha.
      const boletas = await manager.query(
        `SELECT boleta.id::text AS id, boleta.estado
           FROM rutas_paradas parada
           INNER JOIN rutas_paradas_boletas documento ON documento.parada_id = parada.id
           INNER JOIN boletas_envio boleta ON boleta.id = documento.boleta_id
          WHERE parada.ruta_id = $1 AND parada.estado_entrega <> $2
          ORDER BY boleta.id
          FOR UPDATE OF boleta`,
        [rutaId, EstadoEntrega.ANULADA],
      ) as BoletaRuta[];
      if (boletas.length === 0) throw new ConflictException('La ruta no tiene boletas para despachar');
      const invalidas = noEmitidas(boletas);
      if (invalidas) throw new ConflictException(`Solo se despachan boletas EMITIDAS: ${invalidas}`);

      const despachadaEn = new Date();
      await manager.update(Ruta, { id: rutaId }, {
        estado: EstadoRuta.DESPACHADA,
        despachadaEn,
        despachadaPorUsuarioId: usuarioId,
        despachoObservacion: observacion,
      });
      // Mismo commit que el despacho (CA-05); la publicación ocurre después.
      await this.eventos.registrarDespacho(manager, {
        rutaId,
        fechaProgramada: ruta.fecha_programada,
        vehiculoExternoId: ruta.vehiculo_externo_id,
        choferExternoId: ruta.chofer_externo_id,
        despachadaEn,
        despachadaPorUsuarioId: usuarioId,
        boletaIds: [...new Set(boletas.map((boleta) => boleta.id))],
      });
      return this.cargar(manager, rutaId);
    });
  }

  entregar(rutaId: string, paradaId: string, usuarioId: string, observacion: string | null): Promise<Ruta> {
    if (!idValido(rutaId)) throw new NotFoundException('Ruta no encontrada');
    if (!idValido(paradaId)) throw new NotFoundException('Parada no encontrada');
    return this.dataSource.transaction(async (manager) => {
      const ruta = await this.bloquearRuta(manager, rutaId);
      const paradas = await this.bloquearParadas(manager, rutaId);
      const parada = paradas.find((fila) => fila.id === paradaId);
      if (!parada) {
        const [otra] = await manager.query(
          'SELECT ruta_id::text AS ruta_id FROM rutas_paradas WHERE id = $1',
          [paradaId],
        ) as Array<{ ruta_id: string }>;
        if (!otra) throw new NotFoundException('Parada no encontrada');
        throw new ConflictException(`La parada ${paradaId} no pertenece a la ruta ${rutaId}`);
      }
      validarTransicionEntrega(ruta.estado, parada.estado_entrega, EstadoEntrega.ENTREGADA);

      const boletas = await manager.query(
        `SELECT boleta.id::text AS id, boleta.estado
           FROM rutas_paradas_boletas documento
           INNER JOIN boletas_envio boleta ON boleta.id = documento.boleta_id
          WHERE documento.parada_id = $1
          ORDER BY boleta.id
          FOR UPDATE OF boleta`,
        [paradaId],
      ) as BoletaRuta[];
      if (boletas.length === 0) throw new ConflictException('La parada no tiene boletas para entregar');
      const invalidas = noEmitidas(boletas);
      if (invalidas) throw new ConflictException(`No se pueden entregar boletas anuladas o no emitidas: ${invalidas}`);

      const ahora = new Date();
      await manager.update(RutaParada, { id: paradaId }, {
        estadoEntrega: EstadoEntrega.ENTREGADA,
        entregaActualizadaEn: ahora,
        entregaUsuarioId: usuarioId,
        entregaObservacion: observacion,
      });
      // La ruta se cierra solo cuando todas sus entregas válidas están entregadas.
      const estados = paradas.map((fila) => fila.id === paradaId ? EstadoEntrega.ENTREGADA : fila.estado_entrega);
      if (estadoRutaSegunEntregas(estados) === EstadoRuta.COMPLETADA) {
        await manager.update(Ruta, { id: rutaId }, { estado: EstadoRuta.COMPLETADA, completadaEn: ahora });
      }
      return this.cargar(manager, rutaId);
    });
  }

  private async bloquearRuta(manager: EntityManager, rutaId: string): Promise<RutaBloqueada> {
    const [ruta] = await manager.query(
      `SELECT id::text AS id, estado, fecha_programada::text AS fecha_programada,
              vehiculo_externo_id, chofer_externo_id
         FROM rutas WHERE id = $1 FOR UPDATE`,
      [rutaId],
    ) as RutaBloqueada[];
    if (!ruta) throw new NotFoundException('Ruta no encontrada');
    return ruta;
  }

  private bloquearParadas(manager: EntityManager, rutaId: string): Promise<ParadaBloqueada[]> {
    return manager.query(
      `SELECT id::text AS id, estado_entrega
         FROM rutas_paradas WHERE ruta_id = $1 ORDER BY secuencia FOR UPDATE`,
      [rutaId],
    ) as Promise<ParadaBloqueada[]>;
  }

  private async cargar(manager: EntityManager, id: string): Promise<Ruta> {
    const ruta = await manager.findOne(Ruta, {
      where: { id },
      relations: { paradas: { boletas: true } },
      order: { paradas: { secuencia: 'ASC' } },
    });
    if (!ruta) throw new NotFoundException('Ruta no encontrada');
    return ruta;
  }
}
