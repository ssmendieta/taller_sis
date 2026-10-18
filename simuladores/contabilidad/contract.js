'use strict';

const { randomUUID } = require('node:crypto');

const PRODUCCION_CERRADA_V1 = 'ProduccionCerrada.v1';
const REGISTRO_CONTABLE_RESULTADO_V1 = 'RegistroContableResultado.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class MensajePermanenteError extends Error {}

function validarEntrada(value, attributes = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MensajePermanenteError('El payload debe ser un objeto');
  for (const campo of ['eventId', 'eventType', 'occurredAt', 'source', 'correlationId']) {
    if (typeof value[campo] !== 'string' || !value[campo].trim()) throw new MensajePermanenteError(`Falta ${campo}`);
  }
  if (!UUID.test(value.eventId) || !UUID.test(value.correlationId)) throw new MensajePermanenteError('eventId y correlationId deben ser UUID');
  if (value.eventType !== PRODUCCION_CERRADA_V1) throw new MensajePermanenteError(`eventType debe ser ${PRODUCCION_CERRADA_V1}`);
  for (const campo of ['eventId', 'eventType', 'correlationId']) {
    if (!attributes[campo] || attributes[campo] !== value[campo]) throw new MensajePermanenteError(`attributes.${campo} no coincide`);
  }
  const data = value.data;
  if (!data || typeof data !== 'object' || typeof data.cierreId !== 'string' || !data.cierreId.trim()
    || !Number.isSafeInteger(data.cierreVersion) || data.cierreVersion < 1
    || !Number.isSafeInteger(data.ordenId) || data.ordenId < 1
    || typeof data.cantidadConforme !== 'string' || !/^\d+(?:\.\d{1,4})?$/.test(data.cantidadConforme)) {
    throw new MensajePermanenteError('La referencia o cantidad conforme del cierre es invalida');
  }
  return value;
}

function crearRespuesta(evento, now = new Date(), eventId = randomUUID()) {
  const rechazado = Number(evento.data.cantidadConforme) === 0;
  return {
    eventId,
    eventType: REGISTRO_CONTABLE_RESULTADO_V1,
    occurredAt: now.toISOString(),
    source: 'contabilidad-simulator',
    correlationId: evento.correlationId,
    data: {
      cierreId: evento.data.cierreId,
      cierreVersion: evento.data.cierreVersion,
      ordenId: evento.data.ordenId,
      requestEventId: evento.eventId,
      estado: rechazado ? 'RECHAZADO' : 'RECIBIDO',
      procesadoAt: now.toISOString(),
      ...(rechazado ? {
        codigoRechazo: 'SIN_PRODUCCION_CONFORME',
        detalle: 'El cierre no contiene unidades conformes',
      } : {}),
    },
  };
}

module.exports = {
  MensajePermanenteError,
  PRODUCCION_CERRADA_V1,
  REGISTRO_CONTABLE_RESULTADO_V1,
  crearRespuesta,
  validarEntrada,
};
