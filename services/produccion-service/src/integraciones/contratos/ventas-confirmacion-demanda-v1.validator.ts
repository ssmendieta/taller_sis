import {
  DEMANDA_CONFIRMADA_V1,
  DemandaConfirmadaV1Event,
} from './ventas-confirmacion-demanda-v1';

type JsonObject = Record<string, unknown>;

export interface ErrorValidacionConfirmacionDemandaV1 {
  campo: string;
  motivo: string;
}

export class EventoConfirmacionDemandaV1InvalidoError extends Error {
  readonly codigo = 'EVENTO_CONFIRMACION_DEMANDA_V1_INVALIDO' as const;

  constructor(
    readonly eventId: string | undefined,
    readonly errores: ErrorValidacionConfirmacionDemandaV1[],
  ) {
    super(`Evento de confirmacion de demanda v1 invalido: ${errores
      .map(({ campo, motivo }) => `${campo}: ${motivo}`).join('; ')}`);
    this.name = 'EventoConfirmacionDemandaV1InvalidoError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function esObjeto(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textoNoVacio(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validarConfirmacionDemandaV1(value: unknown): DemandaConfirmadaV1Event {
  const errores: ErrorValidacionConfirmacionDemandaV1[] = [];
  const evento = esObjeto(value) ? value : {};
  if (!esObjeto(value)) errores.push({ campo: 'evento', motivo: 'debe ser un objeto JSON' });
  if (evento.eventType !== DEMANDA_CONFIRMADA_V1) {
    errores.push({ campo: 'eventType', motivo: `debe ser ${DEMANDA_CONFIRMADA_V1}` });
  }
  for (const campo of ['eventId', 'correlationId'] as const) {
    if (typeof evento[campo] !== 'string' || !UUID.test(evento[campo] as string)) {
      errores.push({ campo, motivo: 'debe ser un UUID' });
    }
  }
  if (!textoNoVacio(evento.source)) errores.push({ campo: 'source', motivo: 'debe ser un texto no vacio' });
  if (!textoNoVacio(evento.occurredAt) || Number.isNaN(Date.parse(evento.occurredAt as string))) {
    errores.push({ campo: 'occurredAt', motivo: 'debe ser una fecha ISO 8601 valida' });
  }

  const data = esObjeto(evento.data) ? evento.data : null;
  if (!data) {
    errores.push({ campo: 'data', motivo: 'debe ser un objeto' });
  } else {
    if (data.origen !== 'VENTAS' && data.origen !== 'FACTURACION') {
      errores.push({ campo: 'data.origen', motivo: 'debe ser VENTAS o FACTURACION' });
    }
    if (!textoNoVacio(data.demandaExternaId) || (data.demandaExternaId as string).trim().length > 80) {
      errores.push({ campo: 'data.demandaExternaId', motivo: 'debe tener entre 1 y 80 caracteres' });
    }
  }

  if (errores.length) {
    throw new EventoConfirmacionDemandaV1InvalidoError(
      typeof evento.eventId === 'string' ? evento.eventId : undefined,
      errores,
    );
  }

  const validado = value as DemandaConfirmadaV1Event;
  return {
    ...validado,
    source: validado.source.trim(),
    data: {
      origen: validado.data.origen,
      demandaExternaId: validado.data.demandaExternaId.trim(),
    },
  };
}
