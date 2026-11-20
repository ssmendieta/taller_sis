import type { SentidoKpi } from './entities/meta-kpi.entity';

export type ColorSemaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface UmbralesSemaforo {
  umbralAmarilloPct: number;
  umbralRojoPct: number;
}

export interface ResultadoSemaforo {
  desviacionPct: number | null;
  color: ColorSemaforo | null;
}

const PRECISION = 1e6;

/**
 * Desviación adversa en % respecto a la meta.
 * Positiva = peor que la meta. Negativa o cero = igual o mejor.
 */
export function calcularDesviacionAdversa(
  valor: number,
  meta: number,
  sentido: SentidoKpi,
): number {
  const diferencia = sentido === 'MAYOR_ES_MEJOR' ? meta - valor : valor - meta;
  // Se redondea para evitar errores de coma flotante en los límites.
  return Math.round((diferencia / meta) * 100 * PRECISION) / PRECISION;
}

/**
 * Regla del semáforo (ABC-495).
 * - d < amarillo          → VERDE
 * - amarillo <= d < rojo  → AMARILLO
 * - d >= rojo             → ROJO
 * Sin meta o sin valor, no hay color.
 */
export function calcularSemaforo(
  valor: number | null | undefined,
  meta: number | null | undefined,
  umbrales: UmbralesSemaforo,
  sentido: SentidoKpi,
): ResultadoSemaforo {
  if (
    valor === null || valor === undefined || !Number.isFinite(valor) ||
    meta === null || meta === undefined || !Number.isFinite(meta) || meta <= 0
  ) {
    return { desviacionPct: null, color: null };
  }
  const desviacionPct = calcularDesviacionAdversa(valor, meta, sentido);
  let color: ColorSemaforo = 'VERDE';
  if (desviacionPct >= umbrales.umbralRojoPct) color = 'ROJO';
  else if (desviacionPct >= umbrales.umbralAmarilloPct) color = 'AMARILLO';
  return { desviacionPct: Number(desviacionPct.toFixed(2)), color };
}
