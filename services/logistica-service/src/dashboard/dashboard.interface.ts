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
  uso_capacidad: UsoCapacidadResponse;
}

// ABC-490: uso de capacidad (carga / capacidad) de las rutas despachadas.
export type MotivoUsoNoCalculable = 'CARGA_NO_CALCULABLE' | 'CAPACIDAD_FALTANTE' | 'UNIDAD_INCOMPATIBLE';

export interface UsoCapacidadRuta {
  ruta_id: string;
  fecha: string;
  estado: string;
  vehiculo_externo_id: string;
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
  registros: RegistroKpi[];
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
