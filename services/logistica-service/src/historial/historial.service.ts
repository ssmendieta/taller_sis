import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { EstadoEntrega } from '../despacho/estado-entrega.enum';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { DetalleBoletaRutaDto, DetalleHistorialRutaDto, LoteRutaDto } from './dto/detalle-historial-ruta.dto';
import {
  HistorialRutaItemDto,
  ListarHistorialRutasDto,
  PaginatedHistorialRutasDto,
} from './dto/listar-historial-rutas.dto';

// ABC-391: historial de rutas de solo lectura. Las cuentas de paradas y
// boletas se calculan en subconsultas para no multiplicar filas al paginar.
@Injectable()
export class HistorialService {
  constructor(private readonly dataSource: DataSource) {}

  async listarRutas(query: ListarHistorialRutasDto): Promise<PaginatedHistorialRutasDto> {
    const condiciones: string[] = [];
    const parametros: unknown[] = [];
    const agregar = (sql: string, valor: unknown) => {
      parametros.push(valor);
      condiciones.push(sql.replace('?', `$${parametros.length}`));
    };
    if (query.fechaDesde) agregar('ruta.fecha_programada >= ?::date', query.fechaDesde);
    if (query.fechaHasta) agregar('ruta.fecha_programada <= ?::date', query.fechaHasta);
    if (query.estado) agregar('ruta.estado = ?', query.estado);
    // El chofer es un id externo del ERP: se busca por coincidencia parcial sin distinguir mayúsculas.
    if (query.chofer) agregar("ruta.chofer_externo_id ILIKE '%' || ? || '%'", query.chofer.replace(/[\\%_]/g, '\\$&'));
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [{ total }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM rutas ruta ${where}`,
      parametros,
    ) as Array<{ total: number }>;

    const offset = (query.page - 1) * query.limit;
    const filas = await this.dataSource.query(
      `SELECT ruta.id::text AS id,
              to_char(ruta.fecha_programada, 'YYYY-MM-DD') AS fecha_programada,
              ruta.estado,
              ruta.vehiculo_externo_id,
              ruta.chofer_externo_id,
              (SELECT COUNT(*)::int FROM rutas_paradas parada WHERE parada.ruta_id = ruta.id) AS total_paradas,
              (SELECT COUNT(*)::int
                 FROM rutas_paradas parada
                 INNER JOIN rutas_paradas_boletas documento ON documento.parada_id = parada.id
                WHERE parada.ruta_id = ruta.id) AS total_boletas
         FROM rutas ruta
         ${where}
        ORDER BY ruta.fecha_programada DESC, ruta.id DESC
        LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
      [...parametros, query.limit, offset],
    ) as Array<Record<string, unknown>>;

    const items: HistorialRutaItemDto[] = filas.map((fila) => ({
      id: String(fila.id),
      fechaProgramada: String(fila.fecha_programada),
      estado: fila.estado as EstadoRuta,
      vehiculoExternoId: String(fila.vehiculo_externo_id),
      choferExternoId: String(fila.chofer_externo_id),
      totalParadas: Number(fila.total_paradas),
      totalBoletas: Number(fila.total_boletas),
    }));

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  }

  // ABC-393: detalle de solo lectura de una ruta. Cada consulta filtra por la ruta
  // pedida y todas se leen en la misma instantánea para que el detalle sea coherente.
  async detalleRuta(id: string): Promise<DetalleHistorialRutaDto> {
    if (!/^\d+$/.test(id) || BigInt(id) < BigInt('1') || BigInt(id) > BigInt('9223372036854775807')) {
      throw new NotFoundException('Ruta no encontrada');
    }
    return this.dataSource.transaction('REPEATABLE READ', (manager) => this.leerDetalle(manager, id));
  }

  private async leerDetalle(manager: EntityManager, id: string): Promise<DetalleHistorialRutaDto> {
    const [ruta] = await manager.query(
      `SELECT ruta.id::text AS id,
              to_char(ruta.fecha_programada, 'YYYY-MM-DD') AS fecha_programada,
              ruta.estado, ruta.vehiculo_externo_id, ruta.chofer_externo_id,
              ruta.despachada_en, ruta.completada_en,
              (SELECT to_char(primera.fecha_anterior, 'YYYY-MM-DD')
                 FROM rutas_reprogramaciones primera
                WHERE primera.ruta_id = ruta.id
                ORDER BY primera.registrada_en, primera.id
                LIMIT 1) AS fecha_original
         FROM rutas ruta
        WHERE ruta.id = $1`,
      [id],
    ) as Array<Record<string, any>>;
    if (!ruta) throw new NotFoundException('Ruta no encontrada');

    const paradas = await manager.query(
      `SELECT id::text AS id, secuencia, destino, estado_entrega, entrega_actualizada_en, entrega_observacion
         FROM rutas_paradas
        WHERE ruta_id = $1
        ORDER BY secuencia, id`,
      [id],
    ) as Array<Record<string, any>>;

    const documentos = await manager.query(
      `SELECT documento.parada_id::text AS parada_id,
              boleta.id::text AS boleta_id, boleta.numero, boleta.estado,
              solicitud.orden_id::text AS orden_id,
              item.referencia, item.cantidad::text AS cantidad
         FROM rutas_paradas parada
         INNER JOIN rutas_paradas_boletas documento ON documento.parada_id = parada.id
         INNER JOIN boletas_envio boleta ON boleta.id = documento.boleta_id
         INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
         LEFT JOIN boletas_envio_items item ON item.boleta_id = boleta.id
        WHERE parada.ruta_id = $1
        ORDER BY parada.secuencia, boleta.id, item.id`,
      [id],
    ) as Array<Record<string, any>>;

    const incidencias = await manager.query(
      `SELECT id::text AS id, parada_id::text AS parada_id, tipo, motivo,
              registrada_por_usuario_id::text AS autor, registrada_en
         FROM incidencias_transporte
        WHERE ruta_id = $1
        ORDER BY registrada_en, id`,
      [id],
    ) as Array<Record<string, any>>;

    const reprogramaciones = await manager.query(
      `SELECT id::text AS id, incidencia_id::text AS incidencia_id,
              to_char(fecha_anterior, 'YYYY-MM-DD') AS fecha_anterior,
              to_char(fecha_nueva, 'YYYY-MM-DD') AS fecha_nueva,
              motivo, registrada_por_usuario_id::text AS autor, registrada_en
         FROM rutas_reprogramaciones
        WHERE ruta_id = $1
        ORDER BY registrada_en, id`,
      [id],
    ) as Array<Record<string, any>>;

    // Agrupa las filas (una por ítem) en boletas por parada sin repetirlas.
    const boletasPorParada = new Map<string, Map<string, DetalleBoletaRutaDto>>();
    for (const fila of documentos) {
      const boletas = boletasPorParada.get(fila.parada_id) ?? new Map<string, DetalleBoletaRutaDto>();
      boletasPorParada.set(fila.parada_id, boletas);
      const boleta = boletas.get(fila.boleta_id) ?? {
        id: fila.boleta_id,
        numero: fila.numero ?? null,
        estado: fila.estado as EstadoBoleta,
        ordenId: fila.orden_id,
        items: [],
      };
      boletas.set(fila.boleta_id, boleta);
      if (fila.referencia != null) boleta.items.push({ referencia: fila.referencia, cantidad: fila.cantidad });
    }

    const fecha = (valor: Date | string | null) => (valor == null ? null : new Date(valor).toISOString());
    const boletasRuta = [...boletasPorParada.values()].flatMap((boletas) => [...boletas.values()]);
    return {
      ruta: {
        id: ruta.id,
        fechaProgramada: ruta.fecha_programada,
        fechaOriginal: ruta.fecha_original ?? ruta.fecha_programada,
        estado: ruta.estado as EstadoRuta,
        vehiculoExternoId: ruta.vehiculo_externo_id,
        choferExternoId: ruta.chofer_externo_id,
        despachadaEn: fecha(ruta.despachada_en),
        completadaEn: fecha(ruta.completada_en),
      },
      paradas: paradas.map((parada) => ({
        id: parada.id,
        secuencia: Number(parada.secuencia),
        destino: parada.destino,
        estadoEntrega: parada.estado_entrega as EstadoEntrega,
        entregaActualizadaEn: fecha(parada.entrega_actualizada_en),
        entregaObservacion: parada.entrega_observacion ?? null,
        boletas: [...(boletasPorParada.get(parada.id)?.values() ?? [])],
      })),
      lotes: resumirLotes(boletasRuta),
      incidencias: incidencias.map((incidencia) => ({
        id: incidencia.id,
        paradaId: incidencia.parada_id ?? null,
        tipo: incidencia.tipo,
        motivo: incidencia.motivo,
        registradaPorUsuarioId: incidencia.autor,
        registradaEn: fecha(incidencia.registrada_en) as string,
      })),
      reprogramaciones: reprogramaciones.map((reprogramacion) => ({
        id: reprogramacion.id,
        incidenciaId: reprogramacion.incidencia_id ?? null,
        fechaAnterior: reprogramacion.fecha_anterior,
        fechaNueva: reprogramacion.fecha_nueva,
        motivo: reprogramacion.motivo,
        registradaPorUsuarioId: reprogramacion.autor,
        registradaEn: fecha(reprogramacion.registrada_en) as string,
      })),
    };
  }
}

const ESCALA = BigInt('10000');

function aEscala(cantidad: string): bigint {
  const [entero, decimales = ''] = cantidad.split('.');
  return BigInt(entero) * ESCALA + BigInt(decimales.padEnd(4, '0').slice(0, 4));
}

function deEscala(valor: bigint): string {
  return `${valor / ESCALA}.${(valor % ESCALA).toString().padStart(4, '0')}`;
}

// Suma por lote solo las boletas no anuladas, sin pasar por number para no perder decimales.
export function resumirLotes(boletas: DetalleBoletaRutaDto[]): LoteRutaDto[] {
  const lotes = new Map<string, { total: bigint; boletas: Set<string> }>();
  for (const boleta of boletas) {
    for (const item of boleta.items) {
      const lote = lotes.get(item.referencia) ?? { total: BigInt(0), boletas: new Set<string>() };
      lotes.set(item.referencia, lote);
      lote.boletas.add(boleta.numero ?? boleta.id);
      if (boleta.estado !== EstadoBoleta.ANULADA) lote.total += aEscala(item.cantidad);
    }
  }
  return [...lotes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([referencia, lote]) => ({ referencia, cantidadVigente: deEscala(lote.total), boletas: [...lote.boletas] }));
}
