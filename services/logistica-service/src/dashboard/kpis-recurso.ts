import type {
  EntregasATiempoResponse,
  IncidenciasRutaResponse,
  RankingKpisFila,
  RankingKpisResponse,
  UsoCapacidadRuta,
} from './dashboard.interface';
import { calcularUsoCapacidad, FilaUsoCapacidad } from './uso-capacidad';

// ABC-420, ABC-422 y ABC-520: puntualidad, incidencias y agregación por chofer o vehículo.
// Lógica pura: no consulta la base. El KPI general y cada grupo usan las mismas funciones.

/** Zona horaria del negocio para decidir si una entrega fue el día programado. */
export const ZONA_HORARIA_NEGOCIO = 'America/La_Paz';

/** Una entrega realizada (parada ENTREGADA con hora real) de una ruta que salió. */
export interface FilaEntrega {
  parada_id: string;
  ruta_id: string;
  fecha_programada: string;
  entregada_en: string | Date;
  destino: string;
  chofer_externo_id: string;
  vehiculo_externo_id: string;
  a_tiempo: boolean;
}

/** Una ruta que salió, con sus entregas (paradas no anuladas) e incidencias registradas. */
export interface FilaIncidenciasRuta {
  ruta_id: string;
  fecha_programada: string;
  estado: string;
  chofer_externo_id: string;
  vehiculo_externo_id: string;
  entregas: number | string;
  incidencias: number | string;
}

const pct = (parte: number, total: number, factor = 100) =>
  total > 0 ? Number(((parte / total) * factor).toFixed(2)) : null;

/** % de entregas hechas el día programado de la ruta o antes; null = sin entregas. */
export function calcularEntregasATiempo(filas: FilaEntrega[]): EntregasATiempoResponse {
  const aTiempo = filas.filter((f) => f.a_tiempo).length;
  return { porcentaje: pct(aTiempo, filas.length), a_tiempo: aTiempo, entregadas: filas.length, unidad: '%' };
}

/** Incidencias por cada 100 entregas; null = sin entregas. */
export function calcularIncidenciasRuta(filas: FilaIncidenciasRuta[]): IncidenciasRutaResponse {
  const incidencias = filas.reduce((s, f) => s + Number(f.incidencias), 0);
  const entregas = filas.reduce((s, f) => s + Number(f.entregas), 0);
  return { por_100: pct(incidencias, entregas), incidencias, entregas, unidad: 'por 100' };
}

export type Dimension = 'CHOFER' | 'VEHICULO';
export const DIMENSIONES: readonly Dimension[] = ['CHOFER', 'VEHICULO'];

export interface DatosRanking {
  entregas: FilaEntrega[];
  incidencias: FilaIncidenciasRuta[];
  uso: FilaUsoCapacidad[];
  /** Choferes o vehículos conocidos (copia del ERP), aunque no tengan rutas en el periodo. */
  conocidos: Array<{ id: string; nombre: string | null }>;
}

const clave = (d: Dimension, f: { chofer_externo_id: string; vehiculo_externo_id: string }) =>
  d === 'CHOFER' ? f.chofer_externo_id : f.vehiculo_externo_id;

function fila(id: string, nombre: string | null, entregas: FilaEntrega[], incidencias: FilaIncidenciasRuta[], uso: FilaUsoCapacidad[]): RankingKpisFila {
  const usoCapacidad = calcularUsoCapacidad(uso);
  const datos = {
    entregas_a_tiempo: calcularEntregasATiempo(entregas),
    incidencias_ruta: calcularIncidenciasRuta(incidencias),
    uso_capacidad: {
      porcentaje: usoCapacidad.porcentaje,
      rutas_calculables: usoCapacidad.rutas_calculables,
      rutas_no_calculables: usoCapacidad.rutas_no_calculables,
    },
  };
  return {
    id,
    nombre,
    ...datos,
    sin_datos: datos.entregas_a_tiempo.porcentaje === null && datos.incidencias_ruta.por_100 === null && datos.uso_capacidad.porcentaje === null,
  };
}

/**
 * Agrupa por chofer o vehículo con las mismas fórmulas del KPI general. Los conteos de
 * los grupos suman los del total; el total es exactamente el KPI general del periodo.
 */
export function agruparPorRecurso(dimension: Dimension, datos: DatosRanking): Pick<RankingKpisResponse, 'filas' | 'totales'> {
  const nombres = new Map(datos.conocidos.map((c) => [c.id, c.nombre]));
  const ids = new Set<string>(datos.conocidos.map((c) => c.id));
  const rutaRecurso = new Map<string, string>();
  for (const f of datos.entregas) { ids.add(clave(dimension, f)); rutaRecurso.set(f.ruta_id, clave(dimension, f)); }
  for (const f of datos.incidencias) { ids.add(clave(dimension, f)); rutaRecurso.set(f.ruta_id, clave(dimension, f)); }
  // El uso de capacidad trae el vehículo; el chofer se toma de la misma ruta.
  const recursoDeUso = (f: FilaUsoCapacidad & { chofer_externo_id?: string }) =>
    dimension === 'VEHICULO' ? f.vehiculo_externo_id : (f.chofer_externo_id ?? rutaRecurso.get(f.ruta_id) ?? '');
  for (const f of datos.uso) ids.add(recursoDeUso(f));
  ids.delete('');

  const filas = [...ids].sort().map((id) => fila(
    id,
    nombres.get(id) ?? null,
    datos.entregas.filter((f) => clave(dimension, f) === id),
    datos.incidencias.filter((f) => clave(dimension, f) === id),
    datos.uso.filter((f) => recursoDeUso(f) === id),
  ));
  const { sin_datos: _s, id: _i, nombre: _n, ...totales } = fila('TOTAL', null, datos.entregas, datos.incidencias, datos.uso);
  return { filas, totales };
}

/** Filtra las filas de una ruta por chofer o vehículo (detalle desde el ranking, ABC-531). */
export function deRecurso<T extends { chofer_externo_id?: string; vehiculo_externo_id: string }>(
  filas: T[], recurso: { chofer?: string; vehiculo?: string },
): T[] {
  return filas.filter((f) =>
    (!recurso.chofer || f.chofer_externo_id === recurso.chofer) && (!recurso.vehiculo || f.vehiculo_externo_id === recurso.vehiculo));
}

export type { UsoCapacidadRuta };
