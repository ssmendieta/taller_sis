import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltroDashboardDto } from './dto/filtro-dashboard.dto';
import { MetricasDashboardLogisticaResponse } from './dashboard.interface';

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

    const [boletasRow, rutasRow, entregasRow, cargaRow] = await Promise.all([
      this.consultarBoletas(fechaDesde, fechaHasta),
      this.consultarRutas(strDesde, strHasta),
      this.consultarEntregas(strDesde, strHasta),
      this.consultarCarga(fechaDesde, fechaHasta),
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
}
