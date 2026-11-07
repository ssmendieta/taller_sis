import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Receta } from '../recetas/entities/receta.entity';
import { HistorialOrdenesDto, HistorialOrdenItemDto, ListarHistorialOrdenesDto } from './dto/listar-historial-ordenes.dto';

@Injectable()
export class HistorialService {
  constructor(@InjectRepository(OrdenProduccion) private readonly ordenes: Repository<OrdenProduccion>) {}

  async listarOrdenes(query: ListarHistorialOrdenesDto): Promise<HistorialOrdenesDto> {
    // Receta es una sola fila por PK. No unir materiales, avances ni estados:
    // sus relaciones 1:N multiplicarian las ordenes antes de paginar.
    const consulta = this.ordenes.createQueryBuilder('orden')
      .leftJoin(Receta, 'receta', 'receta.id = orden.producto_id');
    if (query.fechaDesde) consulta.andWhere('orden.fecha_programada >= :desde', { desde: query.fechaDesde });
    if (query.fechaHasta) consulta.andWhere('orden.fecha_programada <= :hasta', { hasta: query.fechaHasta });
    if (query.estado) consulta.andWhere('orden.estado = :estado', { estado: query.estado });
    if (query.producto) {
      consulta.andWhere('(receta.productoCodigo ILIKE :producto OR receta.productoNombre ILIKE :producto)', {
        producto: `%${query.producto.replace(/[\\%_]/g, '\\$&')}%`,
      });
    }
    const total = await consulta.clone().getCount();
    const items = await consulta.select([
      'orden.id AS id', 'orden.codigo AS codigo', 'orden.producto_id AS producto_id',
      'receta.productoCodigo AS producto_codigo', 'receta.productoNombre AS producto_nombre',
      'receta.unidadProducto AS unidad_producto', 'CAST(orden.cantidad AS text) AS cantidad_solicitada',
      "to_char(orden.fecha_programada, 'YYYY-MM-DD') AS fecha_programada", 'orden.estado AS estado',
      'orden.responsable_id AS responsable_usuario_id',
      "COALESCE(NULLIF(BTRIM(orden.responsable_nombre), ''), 'Usuario #' || orden.responsable_id) AS responsable_nombre",
    ]).orderBy('orden.fecha_programada', 'DESC').addOrderBy('orden.id', 'DESC')
      .limit(query.limit).offset((query.page - 1) * query.limit).getRawMany<HistorialOrdenItemDto>();
    return { items, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
  }
}
