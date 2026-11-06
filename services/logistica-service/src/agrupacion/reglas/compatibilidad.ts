// ABC-360: regla reutilizable de compatibilidad para agrupar solicitudes de salida.
// No accede a base de datos ni a otros servicios: recibe los datos ya cargados.

export const ESTADOS_SOLICITUD_AGRUPABLES = ['BORRADOR', 'PREPARADA'] as const;

export interface SolicitudAgrupable {
  id: string;
  estado: string;
  destino: string;
  fechaRequerida: string;
  tipoCarga: string;
  unidadCarga: string;
}

export type MotivoIncompatibilidad =
  | 'SOLICITUD_DUPLICADA'
  | 'ESTADO_NO_AGRUPABLE'
  | 'DATOS_INCOMPLETOS'
  | 'DESTINO_DISTINTO'
  | 'FECHA_DISTINTA'
  | 'TIPO_CARGA_DISTINTO'
  | 'UNIDAD_CARGA_DISTINTA';

export interface Incompatibilidad {
  solicitudId: string;
  motivo: MotivoIncompatibilidad;
}

export interface ResultadoCompatibilidad {
  compatible: boolean;
  incompatibilidades: Incompatibilidad[];
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Destino y tipo se comparan sin distinguir mayúsculas ni espacios repetidos.
export function normalizarTexto(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function fechaValida(valor: string): boolean {
  if (!FECHA_ISO.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function datosCompletos(solicitud: SolicitudAgrupable): boolean {
  return [solicitud.destino, solicitud.tipoCarga, solicitud.unidadCarga]
    .every((valor) => typeof valor === 'string' && valor.trim().length > 0) &&
    typeof solicitud.fechaRequerida === 'string' && fechaValida(solicitud.fechaRequerida);
}

/**
 * Evalúa si un conjunto de solicitudes puede formar un grupo de transporte.
 * La primera solicitud válida fija la referencia; cada diferencia se informa
 * con el id de la solicitud que no coincide, para explicar el rechazo.
 */
export function evaluarCompatibilidad(solicitudes: SolicitudAgrupable[]): ResultadoCompatibilidad {
  const incompatibilidades: Incompatibilidad[] = [];
  const vistos = new Set<string>();
  const candidatas: SolicitudAgrupable[] = [];

  for (const solicitud of solicitudes) {
    if (vistos.has(solicitud.id)) {
      incompatibilidades.push({ solicitudId: solicitud.id, motivo: 'SOLICITUD_DUPLICADA' });
      continue;
    }
    vistos.add(solicitud.id);
    if (!(ESTADOS_SOLICITUD_AGRUPABLES as readonly string[]).includes(solicitud.estado)) {
      incompatibilidades.push({ solicitudId: solicitud.id, motivo: 'ESTADO_NO_AGRUPABLE' });
      continue;
    }
    if (!datosCompletos(solicitud)) {
      incompatibilidades.push({ solicitudId: solicitud.id, motivo: 'DATOS_INCOMPLETOS' });
      continue;
    }
    candidatas.push(solicitud);
  }

  const [referencia, ...resto] = candidatas;
  if (referencia) {
    for (const solicitud of resto) {
      if (normalizarTexto(solicitud.destino) !== normalizarTexto(referencia.destino)) {
        incompatibilidades.push({ solicitudId: solicitud.id, motivo: 'DESTINO_DISTINTO' });
      } else if (solicitud.fechaRequerida !== referencia.fechaRequerida) {
        incompatibilidades.push({ solicitudId: solicitud.id, motivo: 'FECHA_DISTINTA' });
      } else if (normalizarTexto(solicitud.tipoCarga) !== normalizarTexto(referencia.tipoCarga)) {
        incompatibilidades.push({ solicitudId: solicitud.id, motivo: 'TIPO_CARGA_DISTINTO' });
      } else if (solicitud.unidadCarga.trim() !== referencia.unidadCarga.trim()) {
        incompatibilidades.push({ solicitudId: solicitud.id, motivo: 'UNIDAD_CARGA_DISTINTA' });
      }
    }
  }

  return {
    compatible: candidatas.length >= 2 && incompatibilidades.length === 0,
    incompatibilidades,
  };
}
