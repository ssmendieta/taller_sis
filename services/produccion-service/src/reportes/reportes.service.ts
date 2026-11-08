import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CantidadesProduccionDto, MaterialReporteDto, OrdenReporteDto, ReporteProduccionDto, ReporteProduccionQueryDto,
} from './dto/reporte-produccion.dto';

const CAMPOS = ['solicitada', 'producida', 'conforme', 'defectuosa', 'reprocesada', 'recuperada', 'descartada'] as const;
const cero = (): CantidadesProduccionDto => Object.fromEntries(CAMPOS.map((campo) => [campo, '0.0000'])) as unknown as CantidadesProduccionDto;

// NUMERIC(…,4) -> entero escalado: nunca convertir cantidades a number.
function sumar(a: string, b: string): string {
  const escalar = (valor: string) => {
    if (!/^\d+(?:\.\d{1,4})?$/.test(valor)) throw new Error('Cantidad persistida invalida para el reporte');
    const [entero, decimal = ''] = valor.split('.');
    return BigInt(entero) * 10000n + BigInt(decimal.padEnd(4, '0'));
  };
  const total = escalar(a) + escalar(b);
  return `${total / 10000n}.${String(total % 10000n).padStart(4, '0')}`;
}

@Injectable()
export class ReportesService {
  constructor(private readonly source: DataSource) {}

  async produccion(query: ReporteProduccionQueryDto): Promise<ReporteProduccionDto> {
    const producto = query.producto ? `%${query.producto.replace(/[\\%_]/g, '\\$&')}%` : null;
    // Una sola sentencia conserva una instantanea consistente. Cada lateral
    // agrega su propia fuente antes de combinarla con la orden (sin fan-out).
    const filas: OrdenReporteDto[] = await this.source.query(`
      WITH seleccion AS (
        SELECT o.*, c.id AS cierre_id, c.cierre_version,
          CASE WHEN c.id IS NOT NULL THEN (c.producto->>'productoId')::integer ELSE o.receta_id END AS receta_id_efectivo,
          CASE WHEN c.id IS NOT NULL THEN c.orden_codigo ELSE o.codigo END AS codigo_efectivo,
          CASE WHEN c.id IS NOT NULL THEN c.producto->>'codigo' ELSE r.producto_codigo END AS producto_codigo,
          CASE WHEN c.id IS NOT NULL THEN c.producto->>'nombre' ELSE r.producto_nombre END AS producto_nombre,
          CASE WHEN c.id IS NOT NULL THEN c.producto->>'unidad' ELSE r.unidad_producto END AS unidad,
          c.cantidad_solicitada AS solicitada_cierre, c.cantidad_producida AS producida_cierre,
          c.cantidad_conforme AS conforme_cierre, c.cantidad_defectuosa AS defectuosa_cierre,
          c.consumos AS consumos_cierre
        FROM ordenes_produccion o
        LEFT JOIN recetas r ON r.id = o.receta_id
        LEFT JOIN LATERAL (
          SELECT * FROM cierres_produccion c WHERE c.orden_id = o.id
          ORDER BY c.cierre_version DESC, c.id DESC LIMIT 1
        ) c ON TRUE
        WHERE ($1::date IS NULL OR o.fecha_programada >= $1::date)
          AND ($2::date IS NULL OR o.fecha_programada <= $2::date)
      )
      SELECT o.id AS "ordenId", o.codigo_efectivo AS codigo,
        to_char(o.fecha_programada, 'YYYY-MM-DD') AS "fechaProgramada",
        jsonb_build_object('recetaId', o.receta_id_efectivo, 'codigo', o.producto_codigo,
          'nombre', o.producto_nombre, 'unidad', o.unidad) AS producto,
        CASE WHEN o.cierre_id IS NULL THEN 'REGISTROS' ELSE 'CIERRE' END AS fuente,
        CASE WHEN o.cierre_id IS NULL THEN NULL ELSE
          jsonb_build_object('id', o.cierre_id::text, 'version', o.cierre_version) END AS cierre,
        jsonb_build_object(
          'solicitada', COALESCE(o.solicitada_cierre, o.cantidad_solicitada)::text,
          'producida', COALESCE(o.producida_cierre, a.producida, 0)::text,
          'conforme', COALESCE(o.conforme_cierre, q.conforme, 0)::text,
          'defectuosa', COALESCE(o.defectuosa_cierre, q.defectuosa, 0)::text,
          'reprocesada', COALESCE(p.procesada, 0)::text,
          'recuperada', COALESCE(p.recuperada, 0)::text,
          'descartada', COALESCE(p.descartada, 0)::text
        ) AS cantidades,
        consumo.items AS consumos, perdida.items AS perdidas
      FROM seleccion o
      LEFT JOIN LATERAL (
        SELECT SUM(cantidad_producida) AS producida FROM avances_produccion
        WHERE orden_id = o.id AND o.cierre_id IS NULL
      ) a ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(cantidad) FILTER (WHERE tipo = 'CONFORME') AS conforme,
          SUM(cantidad) FILTER (WHERE tipo = 'DEFECTUOSO') AS defectuosa
        FROM resultados_conformes WHERE orden_id = o.id AND o.cierre_id IS NULL
      ) q ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(cantidad_procesada) AS procesada, SUM(cantidad_recuperada) AS recuperada,
          SUM(cantidad_descartada) AS descartada FROM reprocesos WHERE orden_id = o.id
      ) p ON TRUE
      CROSS JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('materialId', material_id::text,
          'unidad', unidad, 'cantidad', cantidad::text) ORDER BY material_id, unidad), '[]'::jsonb) AS items
        FROM (
          SELECT material_id, unidad, SUM(cantidad) AS cantidad FROM (
            SELECT material_id, unidad, cantidad FROM consumos_material
              WHERE orden_id = o.id AND o.cierre_id IS NULL
            UNION ALL
            SELECT (item->>'materialId')::bigint, item->>'unidad', (item->>'cantidad')::numeric
              FROM jsonb_array_elements(COALESCE(o.consumos_cierre, '[]'::jsonb)) item
          ) origen GROUP BY material_id, unidad
        ) agrupado
      ) consumo
      CROSS JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('materialId', material_id::text,
          'unidad', unidad, 'cantidad', cantidad::text) ORDER BY material_id, unidad), '[]'::jsonb) AS items
        FROM (SELECT material_id, unidad, SUM(cantidad) AS cantidad FROM perdidas_materia_prima
          WHERE orden_id = o.id GROUP BY material_id, unidad) agrupado
      ) perdida
      WHERE ($3::text IS NULL OR o.producto_codigo ILIKE $3 OR o.producto_nombre ILIKE $3)
      ORDER BY o.fecha_programada DESC, o.id DESC
    `, [query.fechaDesde ?? null, query.fechaHasta ?? null, producto]);

    const productos = new Map<string, ReporteProduccionDto['totales']['productos'][number]>();
    const consumos = new Map<string, MaterialReporteDto>();
    const perdidas = new Map<string, MaterialReporteDto>();
    const acumularMateriales = (mapa: Map<string, MaterialReporteDto>, items: MaterialReporteDto[]) => {
      for (const item of items) {
        item.cantidad = sumar('0', item.cantidad);
        const clave = JSON.stringify([item.materialId, item.unidad]);
        const anterior = mapa.get(clave);
        mapa.set(clave, { ...item, cantidad: sumar(anterior?.cantidad ?? '0', item.cantidad) });
      }
    };
    for (const orden of filas) {
      // Separar tambien versiones de receta y etiquetas congeladas diferentes.
      // Si falta unidad/catalogo, no mezclar ordenes de identidad desconocida.
      const clave = JSON.stringify([orden.producto, orden.producto.unidad === null ? orden.ordenId : null]);
      const grupo = productos.get(clave) ?? { producto: orden.producto, cantidades: cero() };
      for (const campo of CAMPOS) {
        orden.cantidades[campo] = sumar('0', orden.cantidades[campo]);
        grupo.cantidades[campo] = sumar(grupo.cantidades[campo], orden.cantidades[campo]);
      }
      productos.set(clave, grupo);
      acumularMateriales(consumos, orden.consumos);
      acumularMateriales(perdidas, orden.perdidas);
    }
    const ordenar = (mapa: Map<string, MaterialReporteDto>) => [...mapa.values()].sort((a, b) =>
      a.materialId.localeCompare(b.materialId) || a.unidad.localeCompare(b.unidad));
    return {
      filtros: { fechaDesde: query.fechaDesde ?? null, fechaHasta: query.fechaHasta ?? null,
        producto: query.producto ?? null, campoFecha: 'fecha_programada' },
      ordenes: filas,
      totales: { ordenes: filas.length, productos: [...productos.values()], consumos: ordenar(consumos), perdidas: ordenar(perdidas) },
    };
  }
}
