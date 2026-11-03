import { CODIGOS_UNIDADES } from '../unidades/unidades.catalogo';
import { DemandaRegistradaV1Event } from '../integraciones/contratos/ventas-demanda-v1';
import {
  ErrorValidacionDemandaV1,
  EventoDemandaV1InvalidoError,
} from '../integraciones/contratos/ventas-demanda-v1.validator';
import { ORIGENES_DEMANDA } from './entities/demanda.entity';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const CANTIDAD = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;

function textoHasta(value: unknown, maximo: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximo;
}

/**
 * ABC-357: reglas de negocio de la demanda, aplicadas después de validar el sobre.
 * Devuelve el evento con textos recortados y cantidades normalizadas a 4 decimales,
 * para que el mismo pedido escrito distinto ("40" y "40.0000") se reconozca igual.
 */
export function validarDemandaRegistradaV1(evento: DemandaRegistradaV1Event): DemandaRegistradaV1Event {
  const errores: ErrorValidacionDemandaV1[] = [];
  const data = evento.data;

  if (!(ORIGENES_DEMANDA as readonly string[]).includes(data.origen)) {
    errores.push({ campo: 'data.origen', motivo: `debe ser ${ORIGENES_DEMANDA.join(' o ')}` });
  }
  if (!textoHasta(data.demandaExternaId, 80)) {
    errores.push({ campo: 'data.demandaExternaId', motivo: 'debe tener entre 1 y 80 caracteres' });
  }
  const fechaMs = typeof data.fechaRequerida === 'string' ? Date.parse(`${data.fechaRequerida}T00:00:00Z`) : Number.NaN;
  if (!FECHA_ISO.test(String(data.fechaRequerida)) || Number.isNaN(fechaMs) ||
      new Date(fechaMs).toISOString().slice(0, 10) !== data.fechaRequerida) {
    errores.push({ campo: 'data.fechaRequerida', motivo: 'debe ser una fecha válida YYYY-MM-DD' });
  }

  const productos = new Set<string>();
  const items = (Array.isArray(data.items) ? data.items : []).map((item, indice) => {
    const campo = `data.items[${indice}]`;
    if (!item || typeof item !== 'object') {
      errores.push({ campo, motivo: 'debe ser un objeto' });
      return item;
    }
    if (!textoHasta(item.productoCodigo, 80)) {
      errores.push({ campo: `${campo}.productoCodigo`, motivo: 'debe tener entre 1 y 80 caracteres' });
    } else if (productos.has(item.productoCodigo.trim())) {
      errores.push({ campo: `${campo}.productoCodigo`, motivo: 'el producto está repetido en la demanda' });
    } else {
      productos.add(item.productoCodigo.trim());
    }
    const cantidad = typeof item.cantidad === 'string' ? item.cantidad.trim() : '';
    if (!CANTIDAD.test(cantidad) || /^0(?:\.0+)?$/.test(cantidad)) {
      errores.push({ campo: `${campo}.cantidad`, motivo: 'debe ser un decimal positivo en texto con hasta 4 decimales' });
    }
    if (typeof item.unidad !== 'string' || !CODIGOS_UNIDADES.includes(item.unidad.trim())) {
      errores.push({ campo: `${campo}.unidad`, motivo: 'no es una unidad de medida conocida' });
    }
    const [entero, decimales = ''] = cantidad.split('.');
    return {
      productoCodigo: String(item.productoCodigo ?? '').trim(),
      cantidad: `${entero}.${decimales.padEnd(4, '0')}`,
      unidad: String(item.unidad ?? '').trim(),
    };
  });

  if (errores.length) throw new EventoDemandaV1InvalidoError(evento.eventId, errores);
  return {
    ...evento,
    data: {
      origen: data.origen,
      demandaExternaId: data.demandaExternaId.trim(),
      fechaRequerida: data.fechaRequerida,
      items,
    },
  };
}
