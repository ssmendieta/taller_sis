import { DEMANDA_REGISTRADA_V1, DemandaRegistradaV1Event } from './ventas-demanda-v1';

type JsonObject = Record<string, unknown>;

export interface ErrorValidacionDemandaV1 {
  campo: string;
  motivo: string;
}

export class EventoDemandaV1InvalidoError extends Error {
  readonly codigo = 'EVENTO_DEMANDA_V1_INVALIDO' as const;

  constructor(
    readonly eventId: string | undefined,
    readonly errores: ErrorValidacionDemandaV1[],
  ) {
    super(`Evento de demanda v1 invalido: ${errores.map(({ campo, motivo }) => `${campo}: ${motivo}`).join('; ')}`);
    this.name = 'EventoDemandaV1InvalidoError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function esObjeto(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textoNoVacio(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// ABC-356: valida el sobre versionado y la forma mínima para persistir la demanda.
export function validarSobreDemandaV1(value: unknown): DemandaRegistradaV1Event {
  const errores: ErrorValidacionDemandaV1[] = [];
  const evento = esObjeto(value) ? value : {};
  if (!esObjeto(value)) errores.push({ campo: 'evento', motivo: 'debe ser un objeto JSON' });
  if (evento.eventType !== DEMANDA_REGISTRADA_V1) {
    errores.push({ campo: 'eventType', motivo: `debe ser ${DEMANDA_REGISTRADA_V1}` });
  }
  for (const campo of ['eventId', 'correlationId'] as const) {
    if (typeof evento[campo] !== 'string' || !UUID.test(evento[campo] as string)) {
      errores.push({ campo, motivo: 'debe ser un UUID' });
    }
  }
  for (const campo of ['occurredAt', 'source'] as const) {
    if (!textoNoVacio(evento[campo])) errores.push({ campo, motivo: 'debe ser un texto no vacio' });
  }
  const data = esObjeto(evento.data) ? evento.data : null;
  if (!data) {
    errores.push({ campo: 'data', motivo: 'debe ser un objeto' });
  } else {
    for (const campo of ['origen', 'demandaExternaId', 'fechaRequerida'] as const) {
      if (!textoNoVacio(data[campo])) errores.push({ campo: `data.${campo}`, motivo: 'debe ser un texto no vacio' });
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errores.push({ campo: 'data.items', motivo: 'debe incluir al menos un item' });
    }
  }
  if (errores.length) {
    throw new EventoDemandaV1InvalidoError(typeof evento.eventId === 'string' ? evento.eventId : undefined, errores);
  }
  return value as DemandaRegistradaV1Event;
}
