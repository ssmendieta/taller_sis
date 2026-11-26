export interface DesglosePerdidaMaterial {
  material_id: string;
  material_codigo: string;
  material_nombre: string;
  unidad: string;
  cantidad: number;
}

export interface MetricasDashboardResponse {
  periodo: {
    desde: string | null;
    hasta: string | null;
  };
  resumen: {
    total_ordenes: number;
    porcentaje_conformes: number;
    porcentaje_avance_global: number;
    total_incidencias: number;
    total_perdidas: number;
  };
  ordenes_por_estado: {
    PENDIENTE: number;
    PLANIFICADA: number;
    EN_PRODUCCION: number;
    FINALIZADA: number;
    CANCELADA: number;
    total: number;
  };
  calidad: {
    unidades_conformes: number;
    unidades_defectuosas: number;
    total_evaluado: number;
    porcentaje_conformes: number;
    porcentaje_defectuosas: number;
    /** ABC-470: % conformes a la primera, sin reprocesos. null = sin datos. */
    fpy: number | null;
    unidades_conformes_primera: number;
    unidades_recuperadas: number;
    /** % conformes tras reprocesos (primera + recuperadas). null = sin datos. */
    porcentaje_conformes_final: number | null;
  };
  avance_global: {
    cantidad_solicitada_total: number;
    cantidad_producida_total: number;
    cantidad_pendiente_total: number;
    porcentaje_avance_global: number;
    total_registros_avance: number;
  };
  perdidas_materia_prima: {
    total_registros: number;
    cantidad_total: number;
    desglose_por_material: DesglosePerdidaMaterial[];
  };
  incidencias: {
    total_observaciones: number;
    total_incidencias: number;
    total: number;
  };
  /** ABC-466: tiempo de ciclo promedio de las órdenes finalizadas (horas). null = sin datos. */
  tiempo_ciclo: {
    promedio_horas: number | null;
    ordenes_evaluadas: number;
    unidad: 'horas';
  };
  /** ABC-462: porcentaje de órdenes finalizadas en o antes de su fecha requerida. null = sin datos. */
  cumplimiento_fecha: {
    porcentaje: number | null;
    a_tiempo: number;
    total_finalizadas: number;
    unidad: '%';
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

// ABC-500: avisos de KPI en rojo.
export interface AvisoKpiResponse {
  id: number;
  kpi: string;
  valor: number;
  meta: number | null;
  fecha: string;
  leido: boolean;
}

// ABC-526: contador de avisos de KPI sin leer.
export interface AvisosSinLeerResponse {
  total: number;
}

// ABC-512: registros que componen el valor de un KPI.
export interface DetalleKpiResponse {
  kpi: string;
  periodo: { desde: string | null; hasta: string | null };
  /** false = el KPI existe pero este servicio todavía no lo calcula. */
  disponible: boolean;
  /** Mismo valor que el KPI en ese periodo; null = sin datos. */
  valor: number | null;
  unidad: string | null;
  registros: RegistroKpi[];
  /** Solo FPY: defectos del periodo por causa, de mayor a menor. */
  causas_defecto?: CausaDefecto[];
  /** Solo FPY: total de unidades defectuosas (igual a la suma de las causas). */
  unidades_defectuosas?: number;
}

export interface RegistroKpi {
  tipo: 'ORDEN';
  id: string;
  codigo: string;
  estado: string;
  /** Aporte de la orden al KPI, en la unidad del detalle. */
  valor: number | null;
  /** FPY: conformes a la primera sobre evaluadas. */
  conformes_primera?: number;
  evaluadas?: number;
  /** TIEMPO_CICLO y CUMPLIMIENTO_FECHA (ISO 8601). */
  iniciada_en?: string;
  finalizada_en?: string;
  /** CUMPLIMIENTO_FECHA: fecha requerida y si terminó a tiempo. */
  fecha_programada?: string;
  a_tiempo?: boolean;
}

export interface CausaDefecto {
  causa: string;
  cantidad: number;
}
