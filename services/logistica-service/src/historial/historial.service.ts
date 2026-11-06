import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
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
}
