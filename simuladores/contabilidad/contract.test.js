'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { crearRespuesta, validarEntrada } = require('./contract');

function evento(cantidadConforme = '10.0000') {
  return {
    eventId: '7eb50b45-f4f1-47a6-9af5-1f0f98711dd8', eventType: 'ProduccionCerrada.v1',
    occurredAt: '2026-10-17T20:00:00.000Z', source: 'produccion-service',
    correlationId: '461f20b3-526f-48c2-82b8-713c0f709b3c',
    data: { cierreId: '1', cierreVersion: 1, ordenId: 15, cantidadConforme },
  };
}

function attributes(value) {
  return { eventId: value.eventId, eventType: value.eventType, correlationId: value.correlationId };
}

test('mantiene correlationId y requestEventId en RECIBIDO', () => {
  const request = evento();
  validarEntrada(request, attributes(request));
  const response = crearRespuesta(request, new Date('2026-10-17T20:00:03.000Z'), 'f03b8547-47aa-4c66-a93c-d8f6162730c7');
  assert.equal(response.correlationId, request.correlationId);
  assert.equal(response.data.requestEventId, request.eventId);
  assert.equal(response.data.estado, 'RECIBIDO');
});

test('rechaza cuando cantidadConforme es cero', () => {
  const request = evento('0.0000');
  const response = crearRespuesta(request);
  assert.equal(response.data.estado, 'RECHAZADO');
  assert.equal(response.data.codigoRechazo, 'SIN_PRODUCCION_CONFORME');
});
