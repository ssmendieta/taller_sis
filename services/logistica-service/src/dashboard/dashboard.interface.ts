export interface MetricasDashboardLogisticaResponse {
  periodo: {
    desde: string | null;
    hasta: string | null;
  };
  resumen: {
    total_boletas: number;
    boletas_emitidas: number;
    rutas_en_curso: number;
    rutas_planificadas: number;
    porcentaje_entregas_completadas: number;
    total_incidencias: number;
  };
  boletas_por_estado: {
    BORRADOR: number;
    EMITIDA: number;
    ANULADA: number;
    total: number;
  };
  rutas_por_estado: {
    PLANIFICADA: number;
    DESPACHADA: number;
    COMPLETADA: number;
    CANCELADA: number;
    total: number;
  };
  entregas: {
    total_paradas: number;
    entregadas: number;
    pendientes: number;
    anuladas: number;
    porcentaje_efectividad: number;
  };
  incidencias: {
    boletas_anuladas: number;
    rutas_canceladas: number;
    entregas_anuladas: number;
    total: number;
  };
  volumen_carga: {
    total_items: number;
    cantidad_total: number;
  };
}

// ABC-495: metas de KPI y semáforo.
import type { SentidoKpi } from './entities/meta-kpi.entity';
import type { ColorSemaforo } from './semaforo';

export interface MetaKpiResponse {
  kpi: string;
  meta: number | null;
  unidad: string;
  umbralAmarilloPct: number;
  umbralRojoPct: number;
  sentido: SentidoKpi;
  actualizadoPor: number | null;
  actualizadoEn: string;
}

export interface KpiSemaforoResponse {
  kpi: string;
  valor: number | null;
  meta: number | null;
  unidad: string;
  sentido: SentidoKpi;
  desviacionPct: number | null;
  color: ColorSemaforo | null;
}

export interface KpisSemaforoResponse {
  kpis: KpiSemaforoResponse[];
}
