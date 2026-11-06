import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { ReporteLogistico, ReporteLogisticoQuery } from './dto/reporte-logistico.dto';
import { armarReporte, DatosReporte } from './reporte-logistico';

// Fecha local de las boletas, igual que la que ve el usuario en pantalla.
const ZONA = 'America/La_Paz';

// ABC-340: datos del reporte logístico. Todas las lecturas se hacen en una
// misma transacción REPEATABLE READ para que los totales sean de un solo instante.
@Injectable()
export class ReportesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly produccion: LotesProduccionClient,
  ) {}

  async generar(filtros: ReporteLogisticoQuery, authorization: string): Promise<ReporteLogistico> {
    const datos = await this.dataSource.transaction('REPEATABLE READ', (manager) => this.leer(manager, filtros));
    const avisos: string[] = [];
    const unidades = await this.unidades([...new Set(datos.boletas.map((boleta) => boleta.orden_id))], authorization, avisos);
    return armarReporte(filtros, { ...datos, unidades }, new Date(), avisos);
  }

  private async leer(manager: EntityManager, filtros: ReporteLogisticoQuery): Promise<Omit<DatosReporte, 'unidades'>> {
    const periodo = [filtros.fechaDesde, filtros.fechaHasta];
    const rutas = await manager.query(
      `SELECT id::text AS id, fecha_programada::text AS fecha_programada, estado, vehiculo_externo_id, chofer_externo_id
         FROM rutas
        WHERE fecha_programada BETWEEN $1::date AND $2::date
          AND ($3::varchar IS NULL OR estado = $3::varchar)
        ORDER BY fecha_programada, id`,
      [...periodo, filtros.estadoRuta],
    );
    const rutaIds = rutas.map((ruta: { id: string }) => ruta.id);
    const deRutas = async (sql: string) => (rutaIds.length ? manager.query(sql, [rutaIds]) : []);
    const paradas = await deRutas(
      `SELECT id::text AS id, ruta_id::text AS ruta_id, estado_entrega
         FROM rutas_paradas WHERE ruta_id = ANY($1::bigint[]) ORDER BY ruta_id, secuencia`,
    );
    // Cada documento tiene una sola boleta y una sola parada: la unión no multiplica filas.
    const documentosRuta = await deRutas(
      `SELECT documento.parada_id::text AS parada_id, documento.boleta_id::text AS boleta_id, boleta.estado
         FROM rutas_paradas_boletas documento
         INNER JOIN rutas_paradas parada ON parada.id = documento.parada_id
         INNER JOIN boletas_envio boleta ON boleta.id = documento.boleta_id
        WHERE parada.ruta_id = ANY($1::bigint[])`,
    );
    const incidencias = await deRutas(
      `SELECT ruta_id::text AS ruta_id, tipo, COUNT(*)::int AS total
         FROM incidencias_transporte WHERE ruta_id = ANY($1::bigint[]) GROUP BY ruta_id, tipo`,
    );
    const reprogramaciones = await deRutas(
      `SELECT ruta_id::text AS ruta_id, COUNT(*)::int AS total
         FROM rutas_reprogramaciones WHERE ruta_id = ANY($1::bigint[]) GROUP BY ruta_id`,
    );

    const boletas = await manager.query(
      `SELECT boleta.id::text AS id, boleta.numero, boleta.estado,
              to_char(boleta.creado_en AT TIME ZONE '${ZONA}', 'YYYY-MM-DD') AS fecha,
              solicitud.orden_id::text AS orden_id
         FROM boletas_envio boleta
         INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
        WHERE (boleta.creado_en AT TIME ZONE '${ZONA}')::date BETWEEN $1::date AND $2::date
          AND ($3::varchar IS NULL OR boleta.estado = $3::varchar)
        ORDER BY boleta.creado_en, boleta.id`,
      [...periodo, filtros.estadoBoleta],
    );
    const boletaIds = boletas.map((boleta: { id: string }) => boleta.id);
    const deBoletas = async (sql: string) => (boletaIds.length ? manager.query(sql, [boletaIds]) : []);
    // Los ítems se agregan por boleta antes de llegar al reporte.
    const itemsBoleta = await deBoletas(
      `SELECT boleta_id::text AS boleta_id, COUNT(*)::int AS items, SUM(cantidad)::text AS cantidad
         FROM boletas_envio_items WHERE boleta_id = ANY($1::bigint[]) GROUP BY boleta_id`,
    );
    const ubicacionBoletas = await deBoletas(
      `SELECT documento.boleta_id::text AS boleta_id, ruta.id::text AS ruta_id,
              ruta.estado AS estado_ruta, parada.estado_entrega
         FROM rutas_paradas_boletas documento
         INNER JOIN rutas_paradas parada ON parada.id = documento.parada_id
         INNER JOIN rutas ruta ON ruta.id = parada.ruta_id
        WHERE documento.boleta_id = ANY($1::bigint[])`,
    );
    return { rutas, paradas, documentosRuta, incidencias, reprogramaciones, boletas, itemsBoleta, ubicacionBoletas };
  }

  // Unidad del producto de cada orden (Producción). Si Producción no responde,
  // el resto queda como desconocido y se avisa en lugar de fallar el reporte.
  private async unidades(ordenIds: string[], authorization: string, avisos: string[]): Promise<Map<string, string | null>> {
    const unidades = new Map<string, string | null>(ordenIds.map((id) => [id, null]));
    for (const [indice, ordenId] of ordenIds.entries()) {
      try {
        const orden = await this.produccion.consultarOrdenPorId(ordenId, authorization) as { producto?: { unidad_producto?: unknown } | null };
        const unidad = orden?.producto?.unidad_producto;
        unidades.set(ordenId, typeof unidad === 'string' && unidad.trim() ? unidad.trim() : null);
      } catch (error) {
        if (error instanceof NotFoundException) continue;
        avisos.push(`No se pudo consultar la unidad de ${ordenIds.length - indice} órdenes en Producción; se muestran como desconocidas.`);
        break;
      }
    }
    return unidades;
  }
}
