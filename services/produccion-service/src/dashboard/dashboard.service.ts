import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltroDashboardDto } from './dto/filtro-dashboard.dto';
import { MetricasDashboardResponse, DesglosePerdidaMaterial } from './dashboard.interface';

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private parsearFechas(filtro: FiltroDashboardDto): {
    fechaDesde: Date | null;
    fechaHasta: Date | null;
  } {
    let fechaDesde: Date | null = null;
    let fechaHasta: Date | null = null;

    if (filtro.desde) {
      const d = new Date(filtro.desde.includes('T') ? filtro.desde : `${filtro.desde}T00:00:00.000Z`);
      if (isNaN(d.getTime())) {
        throw new BadRequestException('La fecha "desde" no es válida.');
      }
      fechaDesde = d;
    }

    if (filtro.hasta) {
      const h = new Date(filtro.hasta.includes('T') ? filtro.hasta : `${filtro.hasta}T23:59:59.999Z`);
      if (isNaN(h.getTime())) {
        throw new BadRequestException('La fecha "hasta" no es válida.');
      }
      fechaHasta = h;
    }

    if (fechaDesde && fechaHasta && fechaDesde.getTime() > fechaHasta.getTime()) {
      throw new BadRequestException(
        'El rango de fechas es inválido: la fecha "desde" no puede ser posterior a la fecha "hasta".',
      );
    }

    return { fechaDesde, fechaHasta };
  }

  async obtenerMetricas(filtro: FiltroDashboardDto = {}): Promise<MetricasDashboardResponse> {
    const { fechaDesde, fechaHasta } = this.parsearFechas(filtro);

    const [
      ordenesRow,
      calidadRow,
      avancesRow,
      perdidasTotalesRow,
      perdidasDesgloseRows,
      observacionesRow,
    ] = await Promise.all([
      this.consultarOrdenes(fechaDesde, fechaHasta),
      this.consultarCalidad(fechaDesde, fechaHasta),
      this.consultarAvances(fechaDesde, fechaHasta),
      this.consultarPerdidasTotales(fechaDesde, fechaHasta),
      this.consultarPerdidasDesglose(fechaDesde, fechaHasta),
      this.consultarObservaciones(fechaDesde, fechaHasta),
    ]);

    const totalOrdenes = Number(ordenesRow?.total ?? 0);
    const pendientes = Number(ordenesRow?.pendientes ?? 0);
    const planificadas = Number(ordenesRow?.planificadas ?? 0);
    const enProduccion = Number(ordenesRow?.en_produccion ?? 0);
    const finalizadas = Number(ordenesRow?.finalizadas ?? 0);
    const canceladas = Number(ordenesRow?.canceladas ?? 0);
    const cantidadSolicitadaTotal = Number(ordenesRow?.cantidad_solicitada_total ?? 0);

    const unidadesConformes = Number(calidadRow?.conformes ?? 0);
    const unidadesDefectuosas = Number(calidadRow?.defectuosos ?? 0);
    const totalEvaluado = Number(calidadRow?.total ?? 0);
    const porcentajeConformes =
      totalEvaluado > 0 ? Number(((unidadesConformes / totalEvaluado) * 100).toFixed(2)) : 0;
    const porcentajeDefectuosas =
      totalEvaluado > 0 ? Number(((unidadesDefectuosas / totalEvaluado) * 100).toFixed(2)) : 0;

    const cantidadProducidaTotal = Number(avancesRow?.cantidad_producida_total ?? 0);
    const totalRegistrosAvance = Number(avancesRow?.total_avances ?? 0);
    const cantidadPendienteTotal = Math.max(0, cantidadSolicitadaTotal - cantidadProducidaTotal);
    const porcentajeAvanceGlobal =
      cantidadSolicitadaTotal > 0
        ? Number(Math.min(100, (cantidadProducidaTotal / cantidadSolicitadaTotal) * 100).toFixed(2))
        : 0;

    const totalRegistrosPerdidas = Number(perdidasTotalesRow?.total_registros ?? 0);
    const cantidadTotalPerdida = Number(perdidasTotalesRow?.cantidad_total ?? 0);
    const desglosePorMaterial: DesglosePerdidaMaterial[] = (perdidasDesgloseRows || []).map((fila) => ({
      material_id: String(fila.material_id),
      material_codigo: fila.material_codigo || 'SIN-CODIGO',
      material_nombre: fila.material_nombre || 'Material desconocido',
      unidad: fila.unidad || 'unidad',
      cantidad: Number(fila.cantidad ?? 0),
    }));

    const totalObservaciones = Number(observacionesRow?.observaciones ?? 0);
    const totalIncidencias = Number(observacionesRow?.incidencias ?? 0);
    const totalObservacionesEIncidencias = Number(observacionesRow?.total ?? 0);

    return {
      periodo: {
        desde: filtro.desde || null,
        hasta: filtro.hasta || null,
      },
      resumen: {
        total_ordenes: totalOrdenes,
        porcentaje_conformes: porcentajeConformes,
        porcentaje_avance_global: porcentajeAvanceGlobal,
        total_incidencias: totalIncidencias,
        total_perdidas: cantidadTotalPerdida,
      },
      ordenes_por_estado: {
        PENDIENTE: pendientes,
        PLANIFICADA: planificadas,
        EN_PRODUCCION: enProduccion,
        FINALIZADA: finalizadas,
        CANCELADA: canceladas,
        total: totalOrdenes,
      },
      calidad: {
        unidades_conformes: unidadesConformes,
        unidades_defectuosas: unidadesDefectuosas,
        total_evaluado: totalEvaluado,
        porcentaje_conformes: porcentajeConformes,
        porcentaje_defectuosas: porcentajeDefectuosas,
      },
      avance_global: {
        cantidad_solicitada_total: cantidadSolicitadaTotal,
        cantidad_producida_total: cantidadProducidaTotal,
        cantidad_pendiente_total: cantidadPendienteTotal,
        porcentaje_avance_global: porcentajeAvanceGlobal,
        total_registros_avance: totalRegistrosAvance,
      },
      perdidas_materia_prima: {
        total_registros: totalRegistrosPerdidas,
        cantidad_total: cantidadTotalPerdida,
        desglose_por_material: desglosePorMaterial,
      },
      incidencias: {
        total_observaciones: totalObservaciones,
        total_incidencias: totalIncidencias,
        total: totalObservacionesEIncidencias,
      },
    };
  }

  private async consultarOrdenes(desde: Date | null, hasta: Date | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desde && hasta) {
      params.push(desde, hasta);
      whereClause = 'WHERE creado_en >= $1 AND creado_en <= $2';
    } else if (desde) {
      params.push(desde);
      whereClause = 'WHERE creado_en >= $1';
    } else if (hasta) {
      params.push(hasta);
      whereClause = 'WHERE creado_en <= $1';
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado = 'PENDIENTE')::int AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'PLANIFICADA')::int AS planificadas,
        COUNT(*) FILTER (WHERE estado = 'EN_PRODUCCION')::int AS en_produccion,
        COUNT(*) FILTER (WHERE estado = 'FINALIZADA')::int AS finalizadas,
        COUNT(*) FILTER (WHERE estado = 'CANCELADA')::int AS canceladas,
        COALESCE(SUM(cantidad_solicitada), 0)::numeric AS cantidad_solicitada_total
      FROM ordenes_produccion
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }

  private async consultarCalidad(desde: Date | null, hasta: Date | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desde && hasta) {
      params.push(desde, hasta);
      whereClause = 'WHERE fecha_hora >= $1 AND fecha_hora <= $2';
    } else if (desde) {
      params.push(desde);
      whereClause = 'WHERE fecha_hora >= $1';
    } else if (hasta) {
      params.push(hasta);
      whereClause = 'WHERE fecha_hora <= $1';
    }

    const sql = `
      SELECT
        COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'CONFORME'), 0)::numeric AS conformes,
        COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'DEFECTUOSO'), 0)::numeric AS defectuosos,
        COALESCE(SUM(cantidad), 0)::numeric AS total
      FROM resultados_conformes
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }

  private async consultarAvances(desde: Date | null, hasta: Date | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desde && hasta) {
      params.push(desde, hasta);
      whereClause = 'WHERE fecha_hora >= $1 AND fecha_hora <= $2';
    } else if (desde) {
      params.push(desde);
      whereClause = 'WHERE fecha_hora >= $1';
    } else if (hasta) {
      params.push(hasta);
      whereClause = 'WHERE fecha_hora <= $1';
    }

    const sql = `
      SELECT
        COALESCE(SUM(cantidad_producida), 0)::numeric AS cantidad_producida_total,
        COUNT(*)::int AS total_avances
      FROM avances_produccion
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }

  private async consultarPerdidasTotales(desde: Date | null, hasta: Date | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desde && hasta) {
      params.push(desde, hasta);
      whereClause = 'WHERE fecha_hora >= $1 AND fecha_hora <= $2';
    } else if (desde) {
      params.push(desde);
      whereClause = 'WHERE fecha_hora >= $1';
    } else if (hasta) {
      params.push(hasta);
      whereClause = 'WHERE fecha_hora <= $1';
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total_registros,
        COALESCE(SUM(cantidad), 0)::numeric AS cantidad_total
      FROM perdidas_materia_prima
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }

  private async consultarPerdidasDesglose(desde: Date | null, hasta: Date | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desde && hasta) {
      params.push(desde, hasta);
      whereClause = 'WHERE p.fecha_hora >= $1 AND p.fecha_hora <= $2';
    } else if (desde) {
      params.push(desde);
      whereClause = 'WHERE p.fecha_hora >= $1';
    } else if (hasta) {
      params.push(hasta);
      whereClause = 'WHERE p.fecha_hora <= $1';
    }

    const sql = `
      SELECT
        p.material_id::text AS material_id,
        COALESCE(m.codigo, 'SIN-CODIGO') AS material_codigo,
        COALESCE(m.nombre, 'Material desconocido') AS material_nombre,
        p.unidad,
        COALESCE(SUM(p.cantidad), 0)::numeric AS cantidad
      FROM perdidas_materia_prima p
      LEFT JOIN materiales m ON m.id = p.material_id
      ${whereClause}
      GROUP BY p.material_id, m.codigo, m.nombre, p.unidad
      ORDER BY cantidad DESC
    `;

    return this.dataSource.query(sql, params);
  }

  private async consultarObservaciones(desde: Date | null, hasta: Date | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desde && hasta) {
      params.push(desde, hasta);
      whereClause = 'WHERE fecha_hora >= $1 AND fecha_hora <= $2';
    } else if (desde) {
      params.push(desde);
      whereClause = 'WHERE fecha_hora >= $1';
    } else if (hasta) {
      params.push(hasta);
      whereClause = 'WHERE fecha_hora <= $1';
    }

    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE tipo = 'OBSERVACION')::int AS observaciones,
        COUNT(*) FILTER (WHERE tipo = 'INCIDENCIA')::int AS incidencias,
        COUNT(*)::int AS total
      FROM observaciones_orden
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }
}
