// ABC-361: prioridad determinista de solicitudes de salida.
// Las mismas solicitudes y la misma fecha de referencia producen siempre el mismo orden.

export type PrioridadExplicita = 'ALTA' | 'MEDIA' | 'BAJA';

export interface SolicitudPriorizable {
  id: string;
  prioridad?: PrioridadExplicita | null;
  fechaRequerida: string;
}

export type NivelPrioridad = 'URGENTE' | PrioridadExplicita;

export interface PrioridadCalculada {
  solicitudId: string;
  nivel: NivelPrioridad;
  diasRestantes: number;
  fechaRequerida: string;
}

// Una solicitud vencida o que vence hoy/mañana pasa por delante de cualquier prioridad explícita.
export const DIAS_UMBRAL_URGENCIA = 1;

const RANGO_NIVEL: Record<NivelPrioridad, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function aDiaUtc(fecha: string, campo: string): number {
  const valor = FECHA_ISO.test(fecha) ? Date.parse(`${fecha}T00:00:00Z`) : Number.NaN;
  if (Number.isNaN(valor) || new Date(valor).toISOString().slice(0, 10) !== fecha) {
    throw new RangeError(`${campo} debe ser una fecha válida YYYY-MM-DD`);
  }
  return valor / MS_POR_DIA;
}

function compararIds(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const diferencia = BigInt(a) - BigInt(b);
    return diferencia === BigInt(0) ? 0 : diferencia < BigInt(0) ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Calcula el nivel y los días restantes sin modificar la solicitud. */
export function calcularPrioridad(
  solicitud: SolicitudPriorizable,
  fechaReferencia: string,
): PrioridadCalculada {
  const diasRestantes = aDiaUtc(solicitud.fechaRequerida, 'fechaRequerida') -
    aDiaUtc(fechaReferencia, 'fechaReferencia');
  const explicita = solicitud.prioridad ?? 'MEDIA';
  return {
    solicitudId: solicitud.id,
    nivel: diasRestantes <= DIAS_UMBRAL_URGENCIA ? 'URGENTE' : explicita,
    diasRestantes,
    fechaRequerida: solicitud.fechaRequerida,
  };
}

/** Devuelve una lista nueva ordenada por nivel, fecha requerida e id (desempate estable). */
export function ordenarPorPrioridad(
  solicitudes: SolicitudPriorizable[],
  fechaReferencia: string,
): PrioridadCalculada[] {
  return solicitudes
    .map((solicitud) => calcularPrioridad(solicitud, fechaReferencia))
    .sort((a, b) =>
      RANGO_NIVEL[a.nivel] - RANGO_NIVEL[b.nivel] ||
      a.diasRestantes - b.diasRestantes ||
      compararIds(a.solicitudId, b.solicitudId),
    );
}
