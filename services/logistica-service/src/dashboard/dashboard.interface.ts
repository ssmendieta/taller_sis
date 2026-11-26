import type { CapacidadV1 } from '../recursos-externos/dto/recursos-logisticos-v1';

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
    /** @deprecated Compatibilidad del widget anterior; ABC-479 usa tiempo_atencion. */
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
    /** @deprecated Compatibilidad del widget anterior; no es el KPI TIEMPO_ATENCION. */
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
  uso_capacidad: UsoCapacidadResponse;
  tiempo_atencion: TiempoAtencionResponse;
  /** ABC-420: entregas hechas el día programado de la ruta o antes. */
  entregas_a_tiempo: EntregasATiempoResponse;
  /** ABC-422: incidencias registradas por cada 100 entregas. */
  incidencias_ruta: IncidenciasRutaResponse;
}

// ABC-478: cada solicitud completamente entregada aporta una observación.
export interface TiempoAtencionResponse {
  /** null = sin solicitudes con entrega real válida en el periodo. */
  promedio_horas: number | null;
  solicitudes_entregadas: number;
  unidad: 'horas';
}

// ABC-490: uso de capacidad (carga / capacidad) de las rutas despachadas.
export type MotivoUsoNoCalculable = 'CARGA_NO_CALCULABLE' | 'CAPACIDAD_FALTANTE' | 'UNIDAD_INCOMPATIBLE';

export interface UsoCapacidadRuta {
  ruta_id: string;
  fecha: string;
  estado: string;
  vehiculo_externo_id: string;
  chofer_externo_id?: string;
  placa: string | null;
  carga: CapacidadV1 | null;
  capacidad: CapacidadV1 | null;
  calculable: boolean;
  /** null = no calculable; ver motivo y detalle. */
  porcentaje: number | null;
  motivo: MotivoUsoNoCalculable | null;
  detalle: string | null;
}

export interface UsoCapacidadVehiculo {
  vehiculo_externo_id: string;
  placa: string | null;
  /** null = sin rutas calculables. */
  porcentaje: number | null;
  rutas_calculables: number;
  rutas_no_calculables: number;
}

export interface UsoCapacidadResponse {
  /** null = sin datos (ninguna ruta calculable). */
  porcentaje: number | null;
  rutas_calculables: number;
  rutas_no_calculables: number;
  por_vehiculo: UsoCapacidadVehiculo[];
  por_ruta: UsoCapacidadRuta[];
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
  /** ABC-531: chofer o vehículo filtrado desde el ranking. */
  recurso?: { chofer: string | null; vehiculo: string | null };
  registros: Array<RegistroKpi | RegistroKpiSolicitud | RegistroKpiEntrega | RegistroKpiIncidencias>;
}

export interface RegistroKpi {
  tipo: 'RUTA';
  id: string;
  codigo: string;
  estado: string;
  /** Uso de capacidad de la ruta, en %; null = no calculable. */
  valor: number | null;
  fecha: string;
  vehiculo_externo_id: string;
  placa: string | null;
  carga: CapacidadV1 | null;
  capacidad: CapacidadV1 | null;
  motivo: MotivoUsoNoCalculable | null;
  detalle: string | null;
}

// TIEMPO_ATENCION: una solicitud de salida completamente entregada.
export interface RegistroKpiSolicitud {
  tipo: 'SOLICITUD';
  id: string;
  codigo: string;
  estado: 'ENTREGADA';
  /** Horas desde la solicitud hasta la entrega que la completó. */
  valor: number;
  orden_id: string;
  /** Ruta de la entrega que completó la solicitud. */
  ruta_id: string | null;
  creado_en: string;
  entregada_en: string;
}

export interface EntregasATiempoResponse {
  /** null = sin entregas en el periodo. */
  porcentaje: number | null;
  a_tiempo: number;
  entregadas: number;
  unidad: '%';
}

export interface IncidenciasRutaResponse {
  /** null = sin entregas en el periodo. */
  por_100: number | null;
  incidencias: number;
  entregas: number;
  unidad: 'por 100';
}

// ENTREGAS_A_TIEMPO: una parada entregada.
export interface RegistroKpiEntrega {
  tipo: 'ENTREGA';
  id: string;
  codigo: string;
  estado: 'ENTREGADA';
  /** 100 si fue a tiempo, 0 si no. */
  valor: number;
  a_tiempo: boolean;
  ruta_id: string;
  fecha_programada: string;
  entregada_en: string;
  chofer_externo_id: string;
  vehiculo_externo_id: string;
}

// INCIDENCIAS_RUTA: una ruta con sus entregas e incidencias.
export interface RegistroKpiIncidencias {
  tipo: 'RUTA_INCIDENCIAS';
  id: string;
  codigo: string;
  estado: string;
  /** Incidencias por 100 entregas de la ruta; null = sin entregas. */
  valor: number | null;
  fecha: string;
  entregas: number;
  incidencias: number;
  chofer_externo_id: string;
  vehiculo_externo_id: string;
}

// ABC-520: KPIs de Logística por chofer o vehículo.
export interface KpisDeRecurso {
  entregas_a_tiempo: EntregasATiempoResponse;
  incidencias_ruta: IncidenciasRutaResponse;
  uso_capacidad: { porcentaje: number | null; rutas_calculables: number; rutas_no_calculables: number };
}

export interface RankingKpisFila extends KpisDeRecurso {
  id: string;
  /** Nombre del chofer o placa del vehículo según la copia del ERP; null si no se conoce. */
  nombre: string | null;
  /** Sin entregas ni rutas calculables en el periodo. */
  sin_datos: boolean;
}

export interface RankingKpisResponse {
  dimension: 'CHOFER' | 'VEHICULO';
  periodo: { desde: string | null; hasta: string | null };
  filas: RankingKpisFila[];
  /** Iguales a los KPIs generales del periodo. */
  totales: KpisDeRecurso;
}
