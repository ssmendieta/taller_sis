import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Receta } from '../recetas/entities/receta.entity';
import { DetalleHistorialOrdenDto, EventoHistorialOrdenDto } from './dto/detalle-historial-orden.dto';
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

  async detalleOrden(ordenId: number): Promise<DetalleHistorialOrdenDto> {
    if (!Number.isSafeInteger(ordenId) || ordenId < 1) {
      throw new BadRequestException('El identificador de la orden debe ser un entero positivo válido');
    }
    return this.ordenes.manager.transaction('REPEATABLE READ', async (manager) => {
      const orden = await manager.getRepository(OrdenProduccion).createQueryBuilder('orden')
        .leftJoin(Receta, 'receta', 'receta.id = orden.producto_id')
        .select('orden.id', 'id')
        .addSelect('orden.codigo', 'codigo')
        .addSelect('orden.estado', 'estado')
        .addSelect('receta.unidadProducto', 'unidadProducto')
        .where('orden.id::bigint = :ordenId', { ordenId })
        .getRawOne<DetalleHistorialOrdenDto['orden']>();
      if (!orden) throw new NotFoundException('Orden de producción no encontrada');
      orden.id = ordenId;

      // Cada fuente se consulta por separado. UNION ALL conserva los eventos
      // originales sin multiplicarlos al combinar relaciones uno a muchos.
      const eventos = await manager.query<EventoHistorialOrdenDto[]>(`
        WITH eventos AS (
          SELECT id::bigint AS id, 'ESTADO'::text AS tipo, fecha_hora,
                 usuario_responsable_id::text AS usuario_id,
                 usuario_responsable_nombre AS usuario_nombre, 1 AS prioridad,
                 jsonb_build_object('estadoAnterior', estado_anterior, 'estadoNuevo', estado_nuevo,
                                    'motivo', motivo) AS datos
          FROM historial_estado_orden WHERE orden_id = $1
          UNION ALL
          SELECT id, 'AVANCE', fecha_hora, usuario_responsable_id::text,
                 usuario_responsable_nombre, 2,
                 jsonb_build_object('cantidad', cantidad_producida::text, 'unidad', $2::text)
          FROM avances_produccion WHERE orden_id = $1
          UNION ALL
          SELECT id, tipo, fecha_hora, responsable_usuario_id::text, NULL, 3,
                 jsonb_build_object('cantidad', cantidad::text, 'unidad', $2::text,
                                    'causaDefecto', causa_defecto)
          FROM resultados_conformes WHERE orden_id = $1
          UNION ALL
          SELECT p.id, 'PERDIDA', p.fecha_hora, p.autor_usuario_id::text, NULL, 4,
                 jsonb_build_object('materialId', p.material_id::text, 'materialCodigo', m.codigo,
                                    'materialNombre', m.nombre, 'cantidad', p.cantidad::text,
                                    'unidad', p.unidad, 'motivo', p.motivo)
          FROM perdidas_materia_prima p LEFT JOIN materiales m ON m.id = p.material_id
          WHERE p.orden_id = $1
          UNION ALL
          SELECT id, tipo, fecha_hora, autor_usuario_id::text, autor_nombre, 5,
                 jsonb_build_object('descripcion', descripcion)
          FROM observaciones_orden WHERE orden_id = $1
          UNION ALL
          SELECT id, 'LOTE', fecha_hora, responsable_usuario_id::text, NULL, 6,
                 jsonb_build_object('codigo', codigo, 'cantidad', cantidad::text, 'unidad', $2::text)
          FROM lotes WHERE orden_id = $1
          UNION ALL
          SELECT id, 'REPROCESO', fecha_hora, autor_usuario_id::text, NULL, 7,
                 jsonb_build_object('resultadoCalidadId', resultado_calidad_id::text,
                                    'cantidadProcesada', cantidad_procesada::text,
                                    'cantidadRecuperada', cantidad_recuperada::text,
                                    'cantidadDescartada', cantidad_descartada::text, 'unidad', $2::text)
          FROM reprocesos WHERE orden_id = $1
        )
        SELECT tipo || ':' || id::text AS clave, id::text, tipo, fecha_hora AS "fechaHora",
               usuario_id AS "usuarioId",
               COALESCE(NULLIF(BTRIM(usuario_nombre), ''), 'Usuario #' || usuario_id) AS "usuarioNombre",
               datos
        FROM eventos
        ORDER BY fecha_hora ASC, prioridad ASC, id ASC
      `, [ordenId, orden.unidadProducto]);
      return { orden, eventos };
    });
  }

}
