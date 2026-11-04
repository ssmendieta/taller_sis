'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { StateStore, hash } = require('./state-store');
const { crearRespuesta } = require('./contract');

function muestraValida(customId = 'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6') {
  return {
    eventId: customId,
    eventType: 'SolicitudMaterialAlmacen.v1',
    occurredAt: '2026-10-18T10:00:00.000Z',
    source: 'produccion-service',
    correlationId: '81a265f2-15ec-430c-98e5-e1fa08bb7412',
    data: {
      solicitudId: '27',
      solicitudVersion: 1,
      ordenId: 15,
      ordenCodigo: 'ORD-0015',
      solicitanteUsuarioId: '42',
      fechaNecesaria: '2026-10-20',
      items: [
        {
          materialId: '8',
          materialCodigo: 'HAR-001',
          materialNombre: 'Harina de trigo',
          cantidad: '12.5000',
          unidad: 'kg',
        },
      ],
    },
  };
}

test('StateStore guarda una nueva solicitud e inserta la respuesta pendiente en SQLite', () => {
  const store = new StateStore(':memory:');
  const solicitud = muestraValida();
  const respuesta = crearRespuesta(solicitud);

  const resultado = store.receive(solicitud, respuesta);
  assert.equal(resultado.isNew, true);
  assert.equal(resultado.response.eventId, respuesta.eventId);

  const pendientes = store.getPendingResponses();
  assert.equal(pendientes.length, 1);
  assert.equal(pendientes[0].eventId, respuesta.eventId);
  assert.equal(store.isPending(respuesta.eventId), true);

  store.close();
});

test('StateStore detecta solicitud duplicada y preserva el eventId original de la respuesta', () => {
  const store = new StateStore(':memory:');
  const solicitud = muestraValida();
  const respuesta1 = crearRespuesta(solicitud);

  const res1 = store.receive(solicitud, respuesta1);
  assert.equal(res1.isNew, true);

  // Segunda llegada: se crea un objeto respuesta con un UUID nuevo
  const respuesta2 = crearRespuesta(solicitud);
  assert.notEqual(respuesta1.eventId, respuesta2.eventId);

  // Al recibir el duplicado, debe reutilizar la respuesta1 persistida
  const res2 = store.receive(solicitud, respuesta2);
  assert.equal(res2.isNew, false);
  assert.equal(res2.response.eventId, respuesta1.eventId);
  assert.notEqual(res2.response.eventId, respuesta2.eventId);

  store.close();
});

test('StateStore detecta conflicto si el mismo eventId llega con payload alterado', () => {
  const store = new StateStore(':memory:');
  const solicitud = muestraValida();
  const respuesta = crearRespuesta(solicitud);

  store.receive(solicitud, respuesta);

  const solicitudAlterada = muestraValida();
  solicitudAlterada.data.ordenCodigo = 'ORD-MODIFICADA';

  assert.throws(
    () => store.receive(solicitudAlterada, crearRespuesta(solicitudAlterada)),
    /repetido con contenido diferente/,
  );

  store.close();
});

test('StateStore sobrevive a reinicio en disco y recupera respuestas pendientes', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-store-test-'));
  const dbFile = path.join(tempDir, 'inventarios.db');

  try {
    const store1 = new StateStore(dbFile);
    const solicitud = muestraValida();
    const respuesta = crearRespuesta(solicitud);

    store1.receive(solicitud, respuesta);
    assert.equal(store1.getPendingResponses().length, 1);
    store1.close();

    // Reabrir conexion como si el proceso hubiese reiniciado
    const store2 = new StateStore(dbFile);
    const pendientesRecuperadas = store2.getPendingResponses();

    assert.equal(pendientesRecuperadas.length, 1);
    assert.equal(pendientesRecuperadas[0].eventId, respuesta.eventId);
    assert.equal(pendientesRecuperadas[0].data.solicitudId, '27');
    assert.equal(store2.isPending(respuesta.eventId), true);

    // Marcar como enviada con messageId
    store2.markSent(respuesta.eventId, 'pubsub-msg-12345');
    assert.equal(store2.isPending(respuesta.eventId), false);
    assert.equal(store2.getPendingResponses().length, 0);

    store2.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('StateStore no marca como enviada una respuesta si falla la publicacion', () => {
  const store = new StateStore(':memory:');
  const solicitud = muestraValida();
  const respuesta = crearRespuesta(solicitud);

  store.receive(solicitud, respuesta);

  // Simular intento fallido: NO se llama a markSent
  assert.equal(store.isPending(respuesta.eventId), true);
  assert.equal(store.getPendingResponses().length, 1);

  store.close();
});
