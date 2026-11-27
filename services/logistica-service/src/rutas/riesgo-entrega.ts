import { EstadoEntrega } from '../despacho/estado-entrega.enum';
import { limiteEntrega } from '../despacho/retraso-entrega';

// ABC-458: regla de riesgo de una entrega. La hora programada es el fin del día
// programado en Bolivia (misma regla de ABC-524). Una parada no entregada está en
// riesgo si ese límite ya pasó (VENCIDA) o llega dentro del margen (POR_VENCER).
export const MARGEN_RIESGO_HORAS_POR_DEFECTO = 24;
export type MotivoRiesgo = 'VENCIDA' | 'POR_VENCER';

const MS_POR_HORA = 60 * 60 * 1000;
const BOLIVIA_UTC_MS = -4 * MS_POR_HORA;

/** Margen configurable con ENTREGA_MARGEN_RIESGO_HORAS (entero de 0 a 720; 24 por defecto). */
export function margenRiesgoHoras(env: NodeJS.ProcessEnv = process.env): number {
  const valor = env.ENTREGA_MARGEN_RIESGO_HORAS?.trim();
  return valor && /^\d{1,3}$/.test(valor) && Number(valor) <= 720 ? Number(valor) : MARGEN_RIESGO_HORAS_POR_DEFECTO;
}

export interface RiesgoEntrega {
  motivo: MotivoRiesgo;
  limite: Date;
  /** Minutos que faltan para el límite; negativo si ya venció. */
  minutosRestantes: number;
}

export function evaluarRiesgo(
  parada: { estadoEntrega: string; fechaProgramada: string },
  ahora: Date,
  margenHoras: number,
): RiesgoEntrega | null {
  // Solo lo pendiente: lo ENTREGADO (con su hora real, ABC-414) o ANULADO no corre riesgo.
  if (parada.estadoEntrega !== EstadoEntrega.PENDIENTE) return null;
  const limite = limiteEntrega(parada.fechaProgramada);
  const restanteMs = limite.getTime() - ahora.getTime();
  const minutosRestantes = Math.floor(restanteMs / 60000);
  if (restanteMs <= 0) return { motivo: 'VENCIDA', limite, minutosRestantes };
  if (restanteMs <= margenHoras * MS_POR_HORA) return { motivo: 'POR_VENCER', limite, minutosRestantes };
  return null;
}

/** Última fecha programada cuyo límite cae antes de ahora + margen (para filtrar en SQL). */
export function fechaMaximaEnRiesgo(ahora: Date, margenHoras: number): string {
  // límite(f) = 00:00 del día f+1 en Bolivia ≤ T  ⇔  f ≤ día de Bolivia en T − 1 día.
  const tope = ahora.getTime() + margenHoras * MS_POR_HORA + BOLIVIA_UTC_MS - 24 * MS_POR_HORA;
  return new Date(tope).toISOString().slice(0, 10);
}

function duracion(minutos: number): string {
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const min = minutos % 60;
  const partes = [dias && `${dias} d`, horas && `${horas} h`, (min || (!dias && !horas)) && `${min} min`];
  return partes.filter(Boolean).join(' ');
}

export function describirRiesgo({ motivo, minutosRestantes }: RiesgoEntrega): string {
  return motivo === 'VENCIDA'
    ? `La fecha programada venció hace ${duracion(Math.abs(minutosRestantes))}`
    : `La fecha programada vence en ${duracion(Math.max(minutosRestantes, 0))}`;
}
