import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltroDashboardDto } from './dto/filtro-dashboard.dto';
import { GuardarMetaKpiDto } from './dto/guardar-meta-kpi.dto';
import { calcularSemaforo } from './semaforo';
import { AvisoKpiResponse, AvisosSinLeerResponse, KpisSemaforoResponse, MetaKpiResponse } from './dashboard.interface';
import { MetricasDashboardResponse, DesglosePerdidaMaterial } from './dashboard.interface';

/** KPIs que este servicio administra (ABC-495). */
export const KPIS_DEL_SERVICIO: readonly string[] = ['CUMPLIMIENTO_FECHA', 'TIEMPO_CICLO', 'FPY', 'MERMA'];

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
      fpyRow,
    ] = await Promise.all([
      this.consultarOrdenes(fechaDesde, fechaHasta),
      this.consultarCalidad(fechaDesde, fechaHasta),
      this.consultarAvances(fechaDesde, fechaHasta),
      this.consultarPerdidasTotales(fechaDesde, fechaHasta),
      this.consultarPerdidasDesglose(fechaDesde, fechaHasta),
      this.consultarObservaciones(fechaDesde, fechaHasta),
      this.consultarFpy(fechaDesde, fechaHasta),
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

    // ABC-470: FPY = conformes a la primera (sin reproceso) / evaluadas; null = sin datos.
    const { fpy, conformesPrimera, recuperadas, porcentajeConformesFinal } =
      this.calcularFpy(fpyRow);

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
        fpy,
        unidades_conformes_primera: conformesPrimera,
        unidades_recuperadas: recuperadas,
        porcentaje_conformes_final: porcentajeConformesFinal,
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

  /**
   * ABC-470: unidades evaluadas por primera vez en el periodo (resultados de calidad)
   * y, de ellas, las conformes a la primera. Una unidad que pasó por reproceso no
   * cuenta como conforme a la primera; las recuperadas se informan aparte.
   */
  private calcularFpy(fila: Record<string, unknown> | null) {
    const evaluadas = Number(fila?.evaluadas ?? 0);
    const conformesPrimera = Number(fila?.conformes_primera ?? 0);
    const recuperadas = Number(fila?.recuperadas ?? 0);
    const pct = (n: number) => (evaluadas > 0 ? Number(((n / evaluadas) * 100).toFixed(2)) : null);
    return {
      fpy: pct(conformesPrimera),
      conformesPrimera,
      recuperadas,
      porcentajeConformesFinal: pct(conformesPrimera + recuperadas),
    };
  }

  private async consultarFpy(desde: Date | null, hasta: Date | null) {
    const params: unknown[] = [];
    const condiciones: string[] = [];
    if (desde) {
      params.push(desde);
      condiciones.push(`r.fecha_hora >= $${params.length}`);
    }
    if (hasta) {
      params.push(hasta);
      condiciones.push(`r.fecha_hora <= $${params.length}`);
    }
    const whereClause = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        COALESCE(SUM(r.cantidad) FILTER (
          WHERE r.tipo = 'CONFORME'
            AND NOT EXISTS (SELECT 1 FROM reprocesos p WHERE p.resultado_calidad_id = r.id)
        ), 0)::numeric AS conformes_primera,
        COALESCE(SUM(r.cantidad), 0)::numeric AS evaluadas,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(p.cantidad_recuperada), 0) FROM reprocesos p WHERE p.resultado_calidad_id = r.id)
        ), 0)::numeric AS recuperadas
      FROM resultados_conformes r
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

  // ===== ABC-495: metas de KPI y semáforo =====

  private mapearMeta(fila: Record<string, unknown>): MetaKpiResponse {
    return {
      kpi: String(fila.kpi),
      meta: fila.meta === null || fila.meta === undefined ? null : Number(fila.meta),
      unidad: String(fila.unidad),
      umbralAmarilloPct: Number(fila.umbral_amarillo_pct),
      umbralRojoPct: Number(fila.umbral_rojo_pct),
      sentido: fila.sentido as MetaKpiResponse['sentido'],
      actualizadoPor:
        fila.actualizado_por === null || fila.actualizado_por === undefined
          ? null
          : Number(fila.actualizado_por),
      actualizadoEn: new Date(fila.actualizado_en as string | Date).toISOString(),
    };
  }

  async listarMetas(): Promise<MetaKpiResponse[]> {
    const filas: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT kpi, meta, unidad, umbral_amarillo_pct, umbral_rojo_pct, sentido,
              actualizado_por, actualizado_en
         FROM metas_kpi
        WHERE kpi = ANY($1)
        ORDER BY kpi`,
      [KPIS_DEL_SERVICIO],
    );
    return (filas || []).map((f) => this.mapearMeta(f));
  }

  async obtenerMeta(kpi: string): Promise<MetaKpiResponse> {
    const meta = (await this.listarMetas()).find((m) => m.kpi === kpi);
    if (!meta) throw new NotFoundException(`El KPI "${kpi}" no existe.`);
    return meta;
  }

  async guardarMeta(
    kpi: string,
    dto: GuardarMetaKpiDto,
    usuarioId: number | string | undefined,
  ): Promise<MetaKpiResponse> {
    if (!KPIS_DEL_SERVICIO.includes(kpi)) {
      throw new NotFoundException(`El KPI "${kpi}" no existe.`);
    }
    if (dto.umbralRojoPct <= dto.umbralAmarilloPct) {
      throw new BadRequestException(
        'El umbral rojo debe ser mayor que el umbral amarillo.',
      );
    }
    const actor = Number(usuarioId);
    await this.dataSource.query(
      `UPDATE metas_kpi
          SET meta = $2,
              umbral_amarillo_pct = $3,
              umbral_rojo_pct = $4,
              actualizado_por = $5,
              actualizado_en = NOW()
        WHERE kpi = $1`,
      [
        kpi,
        dto.meta,
        dto.umbralAmarilloPct,
        dto.umbralRojoPct,
        Number.isSafeInteger(actor) && actor > 0 ? actor : null,
      ],
    );
    return this.obtenerMeta(kpi);
  }

  /**
   * Valor actual de un KPI. Cada HU de KPI conecta aquí su consulta; los KPIs
   * sin cálculo devuelven null y salen sin color. FPY: ABC-470 (histórico, sin filtro).
   */
  protected async obtenerValorKpi(kpi: string): Promise<number | null> {
    if (kpi === 'FPY') {
      return this.calcularFpy(await this.consultarFpy(null, null)).fpy;
    }
    return null;
  }

  async obtenerKpisConSemaforo(): Promise<KpisSemaforoResponse> {
    const metas = await this.listarMetas();
    const kpis = await Promise.all(
      metas.map(async (m) => {
        const valor = await this.obtenerValorKpi(m.kpi);
        const { desviacionPct, color } = calcularSemaforo(
          valor,
          m.meta,
          { umbralAmarilloPct: m.umbralAmarilloPct, umbralRojoPct: m.umbralRojoPct },
          m.sentido,
        );
        await this.registrarAvisoSiCambioARojo(m.kpi, valor, m.meta, color);
        return {
          kpi: m.kpi,
          valor,
          meta: m.meta,
          unidad: m.unidad,
          sentido: m.sentido,
          desviacionPct,
          color,
        };
      }),
    );
    return { kpis };
  }

  // ===== ABC-500: avisos de KPI en rojo =====

  /**
   * Guarda el color como último estado conocido y, solo si cambió a ROJO, registra
   * un aviso. Una sola sentencia: si dos consultas concurrentes ven el mismo cambio,
   * solo una cumple `IS DISTINCT FROM` y crea el aviso. KPIs sin color no cambian estado.
   */
  protected async registrarAvisoSiCambioARojo(
    kpi: string,
    valor: number | null,
    meta: number | null,
    color: string | null,
  ): Promise<void> {
    if (color === null || valor === null) return;
    await this.dataSource.query(
      `WITH cambio AS (
         UPDATE metas_kpi
            SET ultimo_color = $2::varchar
          WHERE kpi = $1
            AND ultimo_color IS DISTINCT FROM $2::varchar
        RETURNING kpi
       )
       INSERT INTO avisos_kpi (kpi, valor, meta)
       SELECT $1, $3, $4 FROM cambio WHERE $2::varchar = 'ROJO'`,
      [kpi, color, valor, meta],
    );
  }

  private mapearAviso(fila: Record<string, unknown>): AvisoKpiResponse {
    return {
      id: Number(fila.id),
      kpi: String(fila.kpi),
      valor: Number(fila.valor),
      meta: fila.meta === null || fila.meta === undefined ? null : Number(fila.meta),
      fecha: new Date(fila.fecha as string | Date).toISOString(),
      leido: Boolean(fila.leido),
    };
  }

  async listarAvisos(leido?: boolean): Promise<AvisoKpiResponse[]> {
    const filas: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT id, kpi, valor, meta, fecha, leido
         FROM avisos_kpi
        WHERE kpi = ANY($1)
          AND ($2::boolean IS NULL OR leido = $2::boolean)
        ORDER BY fecha DESC, id DESC`,
      [KPIS_DEL_SERVICIO, leido ?? null],
    );
    return (filas || []).map((f) => this.mapearAviso(f));
  }

  async marcarAvisoLeido(id: number): Promise<AvisoKpiResponse> {
    const filas: Record<string, unknown>[] = await this.dataSource.query(
      `UPDATE avisos_kpi SET leido = TRUE
        WHERE id = $1 AND kpi = ANY($2)
        RETURNING id, kpi, valor, meta, fecha, leido`,
      [id, KPIS_DEL_SERVICIO],
    );
    // Postgres devuelve [filas, cantidad] en UPDATE ... RETURNING con TypeORM.
    const resultado = Array.isArray(filas?.[0]) ? (filas[0] as unknown as Record<string, unknown>[]) : filas;
    if (!resultado || resultado.length === 0) {
      throw new NotFoundException(`El aviso ${id} no existe.`);
    }
    return this.mapearAviso(resultado[0]);
  }

  /** ABC-526: avisos pendientes; los marcados como leídos dejan de contarse. */
  async contarAvisosSinLeer(): Promise<AvisosSinLeerResponse> {
    const filas: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
         FROM avisos_kpi
        WHERE leido = FALSE AND kpi = ANY($1)`,
      [KPIS_DEL_SERVICIO],
    );
    return { total: Number(filas?.[0]?.total ?? 0) };
  }
}
