import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltroDashboardDto } from './dto/filtro-dashboard.dto';
import { GuardarMetaKpiDto } from './dto/guardar-meta-kpi.dto';
import { calcularSemaforo } from './semaforo';
import { calcularUsoCapacidad, FilaUsoCapacidad } from './uso-capacidad';
import { AvisoKpiResponse, AvisosSinLeerResponse, DetalleKpiResponse, KpisSemaforoResponse, MetaKpiResponse } from './dashboard.interface';
import { MetricasDashboardLogisticaResponse } from './dashboard.interface';

/** KPIs que este servicio administra (ABC-495). */
export const KPIS_DEL_SERVICIO: readonly string[] = ['TIEMPO_ATENCION', 'ENTREGAS_A_TIEMPO', 'INCIDENCIAS_RUTA', 'USO_CAPACIDAD'];

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  private parsearFechas(filtro: FiltroDashboardDto): {
    fechaDesde: Date | null;
    fechaHasta: Date | null;
    strDesde: string | null;
    strHasta: string | null;
  } {
    let fechaDesde: Date | null = null;
    let fechaHasta: Date | null = null;
    let strDesde: string | null = null;
    let strHasta: string | null = null;

    if (filtro.desde) {
      const d = new Date(filtro.desde.includes('T') ? filtro.desde : `${filtro.desde}T00:00:00.000Z`);
      if (isNaN(d.getTime())) {
        throw new BadRequestException('La fecha "desde" no es válida.');
      }
      fechaDesde = d;
      strDesde = filtro.desde.split('T')[0];
    }

    if (filtro.hasta) {
      const h = new Date(filtro.hasta.includes('T') ? filtro.hasta : `${filtro.hasta}T23:59:59.999Z`);
      if (isNaN(h.getTime())) {
        throw new BadRequestException('La fecha "hasta" no es válida.');
      }
      fechaHasta = h;
      strHasta = filtro.hasta.split('T')[0];
    }

    if (fechaDesde && fechaHasta && fechaDesde.getTime() > fechaHasta.getTime()) {
      throw new BadRequestException(
        'El rango de fechas es inválido: la fecha "desde" no puede ser posterior a la fecha "hasta".',
      );
    }

    return { fechaDesde, fechaHasta, strDesde, strHasta };
  }

  async obtenerMetricas(filtro: FiltroDashboardDto = {}): Promise<MetricasDashboardLogisticaResponse> {
    const { fechaDesde, fechaHasta, strDesde, strHasta } = this.parsearFechas(filtro);

    const [boletasRow, rutasRow, entregasRow, cargaRow, usoCapacidadFilas] = await Promise.all([
      this.consultarBoletas(fechaDesde, fechaHasta),
      this.consultarRutas(strDesde, strHasta),
      this.consultarEntregas(strDesde, strHasta),
      this.consultarCarga(fechaDesde, fechaHasta),
      this.consultarUsoCapacidad(strDesde, strHasta),
    ]);

    const totalBoletas = Number(boletasRow?.total ?? 0);
    const boletasBorrador = Number(boletasRow?.borrador ?? 0);
    const boletasEmitidas = Number(boletasRow?.emitida ?? 0);
    const boletasAnuladas = Number(boletasRow?.anulada ?? 0);

    const totalRutas = Number(rutasRow?.total ?? 0);
    const rutasPlanificadas = Number(rutasRow?.planificadas ?? 0);
    const rutasDespachadas = Number(rutasRow?.despachadas ?? 0);
    const rutasCompletadas = Number(rutasRow?.completadas ?? 0);
    const rutasCanceladas = Number(rutasRow?.canceladas ?? 0);

    const totalParadas = Number(entregasRow?.total_paradas ?? 0);
    const entregadas = Number(entregasRow?.entregadas ?? 0);
    const pendientesEntrega = Number(entregasRow?.pendientes ?? 0);
    const anuladasEntrega = Number(entregasRow?.anuladas ?? 0);
    const porcentajeEfectividad =
      totalParadas > 0 ? Number(((entregadas / totalParadas) * 100).toFixed(2)) : 0;

    const totalIncidencias = boletasAnuladas + rutasCanceladas + anuladasEntrega;

    const totalItems = Number(cargaRow?.total_items ?? 0);
    const cantidadTotalCarga = Number(cargaRow?.cantidad_total ?? 0);

    return {
      periodo: {
        desde: filtro.desde || null,
        hasta: filtro.hasta || null,
      },
      resumen: {
        total_boletas: totalBoletas,
        boletas_emitidas: boletasEmitidas,
        rutas_en_curso: rutasDespachadas,
        rutas_planificadas: rutasPlanificadas,
        porcentaje_entregas_completadas: porcentajeEfectividad,
        total_incidencias: totalIncidencias,
      },
      boletas_por_estado: {
        BORRADOR: boletasBorrador,
        EMITIDA: boletasEmitidas,
        ANULADA: boletasAnuladas,
        total: totalBoletas,
      },
      rutas_por_estado: {
        PLANIFICADA: rutasPlanificadas,
        DESPACHADA: rutasDespachadas,
        COMPLETADA: rutasCompletadas,
        CANCELADA: rutasCanceladas,
        total: totalRutas,
      },
      entregas: {
        total_paradas: totalParadas,
        entregadas,
        pendientes: pendientesEntrega,
        anuladas: anuladasEntrega,
        porcentaje_efectividad: porcentajeEfectividad,
      },
      incidencias: {
        boletas_anuladas: boletasAnuladas,
        rutas_canceladas: rutasCanceladas,
        entregas_anuladas: anuladasEntrega,
        total: totalIncidencias,
      },
      volumen_carga: {
        total_items: totalItems,
        cantidad_total: cantidadTotalCarga,
      },
      uso_capacidad: calcularUsoCapacidad(usoCapacidadFilas),
    };
  }

  private async consultarBoletas(desde: Date | null, hasta: Date | null) {
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
        COUNT(*) FILTER (WHERE estado = 'BORRADOR')::int AS borrador,
        COUNT(*) FILTER (WHERE estado = 'EMITIDA')::int AS emitida,
        COUNT(*) FILTER (WHERE estado = 'ANULADA')::int AS anulada
      FROM boletas_envio
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }

  private async consultarRutas(desdeStr: string | null, hastaStr: string | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desdeStr && hastaStr) {
      params.push(desdeStr, hastaStr);
      whereClause = 'WHERE fecha_programada >= $1::date AND fecha_programada <= $2::date';
    } else if (desdeStr) {
      params.push(desdeStr);
      whereClause = 'WHERE fecha_programada >= $1::date';
    } else if (hastaStr) {
      params.push(hastaStr);
      whereClause = 'WHERE fecha_programada <= $1::date';
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado = 'PLANIFICADA')::int AS planificadas,
        COUNT(*) FILTER (WHERE estado = 'DESPACHADA')::int AS despachadas,
        COUNT(*) FILTER (WHERE estado = 'COMPLETADA')::int AS completadas,
        COUNT(*) FILTER (WHERE estado = 'CANCELADA')::int AS canceladas
      FROM rutas
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }

  private async consultarEntregas(desdeStr: string | null, hastaStr: string | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desdeStr && hastaStr) {
      params.push(desdeStr, hastaStr);
      whereClause = 'WHERE r.fecha_programada >= $1::date AND r.fecha_programada <= $2::date';
    } else if (desdeStr) {
      params.push(desdeStr);
      whereClause = 'WHERE r.fecha_programada >= $1::date';
    } else if (hastaStr) {
      params.push(hastaStr);
      whereClause = 'WHERE r.fecha_programada <= $1::date';
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total_paradas,
        COUNT(*) FILTER (WHERE p.estado_entrega = 'ENTREGADA')::int AS entregadas,
        COUNT(*) FILTER (WHERE p.estado_entrega = 'PENDIENTE')::int AS pendientes,
        COUNT(*) FILTER (WHERE p.estado_entrega = 'ANULADA')::int AS anuladas
      FROM rutas_paradas p
      INNER JOIN rutas r ON r.id = p.ruta_id
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }

  private async consultarCarga(desde: Date | null, hasta: Date | null) {
    const params: unknown[] = [];
    let whereClause = '';

    if (desde && hasta) {
      params.push(desde, hasta);
      whereClause = 'WHERE b.creado_en >= $1 AND b.creado_en <= $2';
    } else if (desde) {
      params.push(desde);
      whereClause = 'WHERE b.creado_en >= $1';
    } else if (hasta) {
      params.push(hasta);
      whereClause = 'WHERE b.creado_en <= $1';
    }

    const sql = `
      SELECT
        COUNT(*)::int AS total_items,
        COALESCE(SUM(i.cantidad), 0)::numeric AS cantidad_total
      FROM boletas_envio_items i
      INNER JOIN boletas_envio b ON b.id = i.boleta_id
      ${whereClause}
    `;

    const filas = await this.dataSource.query(sql, params);
    return filas[0] || null;
  }

  // ===== ABC-495: metas de KPI y semáforo =====

  /**
   * ABC-490: carga de cada ruta que salió (DESPACHADA o COMPLETADA) y capacidad de su
   * vehículo en la copia del ERP de la misma fecha. La unidad de la carga es la que la
   * boleta guardó al emitirse. Una parada anulada antes del despacho no se cargó y no suma;
   * anulada después, sí viajó. El período filtra por la fecha programada de la ruta.
   */
  private async consultarUsoCapacidad(desdeStr: string | null, hastaStr: string | null): Promise<FilaUsoCapacidad[]> {
    const sql = `
      SELECT
        r.id::text AS ruta_id,
        TO_CHAR(r.fecha_programada, 'YYYY-MM-DD') AS fecha,
        r.estado,
        r.vehiculo_externo_id,
        v.placa,
        v.capacidad_valor::text AS capacidad_valor,
        v.capacidad_unidad,
        rb.boleta_id::text AS boleta_id,
        b.unidad,
        i.cantidad::text AS cantidad
      FROM rutas r
      LEFT JOIN recursos_externos_vehiculos v
        ON v.fecha = r.fecha_programada AND v.id_externo = r.vehiculo_externo_id
      LEFT JOIN (
        SELECT DISTINCT p.ruta_id, pb.boleta_id
        FROM rutas_paradas p
        INNER JOIN rutas pr ON pr.id = p.ruta_id
        INNER JOIN rutas_paradas_boletas pb ON pb.parada_id = p.id
        WHERE p.estado_entrega <> 'ANULADA' OR p.entrega_actualizada_en >= pr.despachada_en
      ) rb ON rb.ruta_id = r.id
      LEFT JOIN boletas_envio b ON b.id = rb.boleta_id
      LEFT JOIN boletas_envio_items i ON i.boleta_id = b.id
      WHERE r.estado IN ('DESPACHADA','COMPLETADA')
        AND ($1::date IS NULL OR r.fecha_programada >= $1::date)
        AND ($2::date IS NULL OR r.fecha_programada <= $2::date)
      ORDER BY r.fecha_programada, r.id, rb.boleta_id, i.id
    `;
    return (await this.dataSource.query(sql, [desdeStr, hastaStr])) || [];
  }

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
   * Valor actual de un KPI. Cada HU de KPI conecta aquí su consulta; los que aún no
   * tienen cálculo devuelven null y salen sin color. USO_CAPACIDAD: ABC-490 (histórico).
   */
  protected async obtenerValorKpi(kpi: string): Promise<number | null> {
    if (kpi === 'USO_CAPACIDAD') {
      return calcularUsoCapacidad(await this.consultarUsoCapacidad(null, null)).porcentaje;
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

  // ===== ABC-512: detalle de un KPI =====

  async obtenerDetalleKpi(kpi: string, filtro: FiltroDashboardDto = {}): Promise<DetalleKpiResponse> {
    if (!KPIS_DEL_SERVICIO.includes(kpi)) {
      throw new NotFoundException(`El KPI "${kpi}" no existe.`);
    }
    const { strDesde, strHasta } = this.parsearFechas(filtro);
    const base = {
      kpi,
      periodo: { desde: filtro.desde || null, hasta: filtro.hasta || null },
      disponible: true,
      valor: null,
      unidad: '%',
      registros: [],
    };
    // Los demás KPIs conectan aquí su detalle cuando tengan cálculo.
    if (kpi !== 'USO_CAPACIDAD') return { ...base, disponible: false, unidad: null };

    const uso = calcularUsoCapacidad(await this.consultarUsoCapacidad(strDesde, strHasta));
    return {
      ...base,
      valor: uso.porcentaje,
      registros: uso.por_ruta.map(({ ruta_id, porcentaje, calculable: _calculable, ...ruta }) => ({
        tipo: 'RUTA' as const,
        id: ruta_id,
        codigo: `Ruta ${ruta_id}`,
        valor: porcentaje,
        ...ruta,
      })),
    };
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
