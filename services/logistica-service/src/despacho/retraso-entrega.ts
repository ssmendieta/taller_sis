// ABC-524: diferencia entre la hora real de entrega y la programada.
// La ruta solo tiene fecha programada (sin hora), así que la hora programada de
// una entrega es el fin de ese día en Bolivia: el mismo criterio de "a tiempo"
// del KPI de ABC-520. Bolivia está en UTC-4 todo el año.
export const UMBRAL_RETRASO_POR_DEFECTO = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Instante en que termina el día programado (00:00 del día siguiente en Bolivia). */
export function limiteEntrega(fechaProgramada: string): Date {
  return new Date(Date.parse(`${fechaProgramada}T00:00:00-04:00`) + MS_POR_DIA);
}

/** Minutos de retraso (positivo) o de anticipación (cero o negativo). */
export function diferenciaMinutos(entregadaEn: Date, fechaProgramada: string): number {
  return Math.ceil((entregadaEn.getTime() - limiteEntrega(fechaProgramada).getTime()) / 60000);
}

/** Umbral configurable con ENTREGA_UMBRAL_RETRASO_MINUTOS (entero ≥ 0; 30 por defecto). */
export function umbralRetraso(env: NodeJS.ProcessEnv = process.env): number {
  const valor = env.ENTREGA_UMBRAL_RETRASO_MINUTOS?.trim();
  return valor && /^\d{1,5}$/.test(valor) ? Number(valor) : UMBRAL_RETRASO_POR_DEFECTO;
}
