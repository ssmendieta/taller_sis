'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

let PubSub;
try {
  PubSub = require('@google-cloud/pubsub').PubSub;
} catch {
  PubSub = require('../../services/produccion-service/node_modules/@google-cloud/pubsub').PubSub;
}

const { SOLICITUD_MATERIAL_ALMACEN_V1 } = require('./contract');

const EMULATOR_HOST = process.env.PUBSUB_EMULATOR_HOST || '127.0.0.1:8085';
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'taller-local';
const INPUT_TOPIC = 'taller-solicitudes-material-local';
const INPUT_SUB = 'taller-inventarios-simulator-local';
const OUTPUT_TOPIC = 'taller-inventarios-respuestas-local';
const OUTPUT_SUB = 'taller-produccion-inventarios-local';

function crearSolicitud(custom = {}) {
  const eventId = custom.eventId || randomUUID();
  const correlationId = custom.correlationId || randomUUID();
  return {
    eventId,
    eventType: SOLICITUD_MATERIAL_ALMACEN_V1,
    occurredAt: new Date().toISOString(),
    source: 'produccion-service',
    correlationId,
    data: {
      solicitudId: custom.solicitudId || '101',
      solicitudVersion: 1,
      ordenId: 50,
      ordenCodigo: 'ORD-TEST-0050',
      solicitanteUsuarioId: '99',
      fechaNecesaria: '2026-10-25',
      items: [
        {
          materialId: '12',
          materialCodigo: custom.materialCodigo || 'MAT-012',
          materialNombre: 'Acero inoxidable',
          cantidad: '25.0000',
          unidad: 'kg',
        },
      ],
    },
  };
}

test('Recorrido real Pub/Sub (Ida y Vuelta con Emulador)', async (t) => {
  process.env.PUBSUB_EMULATOR_HOST = EMULATOR_HOST;
  const client = new PubSub({ projectId: PROJECT_ID });

  // 1. Verificar conectividad al topic
  const [topicExists] = await client.topic(INPUT_TOPIC).exists();
  if (!topicExists) {
    t.skip(`Topic ${INPUT_TOPIC} no existe en el emulador en ${EMULATOR_HOST}`);
    return;
  }

  // Preparar almacén SQLite temporal para el test
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-e2e-'));
  const dbPath = path.join(tempDir, 'inventarios-test.db');
  process.env.INVENTARIOS_STATE_PATH = dbPath;
  process.env.INVENTARIOS_INPUT_SUBSCRIPTION_ID = INPUT_SUB;
  process.env.INVENTARIOS_OUTPUT_TOPIC_ID = OUTPUT_TOPIC;

  // Suscriptor de prueba simulando a Produccion
  const produccionSub = client.subscription(OUTPUT_SUB, {
    flowControl: { maxMessages: 10 },
  });

  const { StateStore } = require('./state-store');
  const { validarEntrada, crearRespuesta } = require('./contract');
  const store = new StateStore(dbPath);

  try {
    // Escuchar respuesta en la suscripcion de Produccion
    const respuestaPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout esperando respuesta en Produccion')), 15000);
      produccionSub.on('message', (msg) => {
        clearTimeout(timeout);
        msg.ack();
        resolve({
          payload: JSON.parse(msg.data.toString('utf8')),
          attributes: msg.attributes,
          messageId: msg.id,
        });
      });
      produccionSub.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // 2. Produccion publica una solicitud valida
    const solicitud = crearSolicitud({ solicitudId: '77' });
    const pubMessageId = await client.topic(INPUT_TOPIC).publishMessage({
      data: Buffer.from(JSON.stringify(solicitud)),
      attributes: {
        eventId: solicitud.eventId,
        eventType: solicitud.eventType,
        source: solicitud.source,
        correlationId: solicitud.correlationId,
      },
    });

    assert.ok(pubMessageId, 'Pub/Sub debe devolver un messageId');

    // 3. Simulador consume de la suscripcion de inventarios
    const simulatorSub = client.subscription(INPUT_SUB, {
      flowControl: { maxMessages: 1 },
    });

    const simuladorProcesadoPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout en el simulador')), 15000);
      simulatorSub.on('message', async (msg) => {
        try {
          clearTimeout(timeout);
          const reqPayload = JSON.parse(msg.data.toString('utf8'));
          const req = validarEntrada(reqPayload, msg.attributes);
          const resp = crearRespuesta(req);
          const stored = store.receive(req, resp);
          msg.ack();

          // Publicar respuesta correlacionada
          const respMsgId = await client.topic(OUTPUT_TOPIC).publishMessage({
            data: Buffer.from(JSON.stringify(stored.response)),
            attributes: {
              eventId: stored.response.eventId,
              eventType: stored.response.eventType,
              source: stored.response.source,
              correlationId: stored.response.correlationId,
            },
          });
          store.markSent(stored.response.eventId, respMsgId);

          resolve({
            requestEventId: req.eventId,
            responseEventId: stored.response.eventId,
            respMsgId,
            isNew: stored.isNew,
          });
        } catch (err) {
          msg.nack();
          reject(err);
        }
      });
    });

    const simuladorResultado = await simuladorProcesadoPromise;
    assert.equal(simuladorResultado.isNew, true);
    assert.equal(simuladorResultado.requestEventId, solicitud.eventId);
    assert.ok(simuladorResultado.respMsgId, 'Respuesta debe tener messageId');

    // 4. Produccion recibe la respuesta
    const recibidaEnProduccion = await respuestaPromise;
    const resp = recibidaEnProduccion.payload;

    assert.equal(resp.eventType, 'SolicitudMaterialAlmacenEstadoActualizado.v1');
    assert.equal(resp.source, 'almacen-service');
    assert.equal(resp.correlationId, solicitud.correlationId);
    assert.equal(resp.data.solicitudId, '77');
    assert.equal(resp.data.requestEventId, solicitud.eventId);
    assert.equal(resp.data.ordenId, 50);
    assert.equal(resp.data.estadoAnterior, 'PENDIENTE');
    assert.equal(resp.data.estadoNuevo, 'APROBADA');
    assert.equal(resp.data.solicitudVersion, 2);

    // 5. Probar deduplicacion con redelivery del mismo eventId y contenido
    const storedDuplicado = store.receive(solicitud, crearRespuesta(solicitud));
    assert.equal(storedDuplicado.isNew, false);
    assert.equal(storedDuplicado.response.eventId, simuladorResultado.responseEventId);

    // 6. Probar deteccion de conflicto con mismo eventId pero contenido alterado
    const solicitudAlterada = { ...solicitud, data: { ...solicitud.data, ordenId: 999 } };
    assert.throws(
      () => store.receive(solicitudAlterada, crearRespuesta(solicitudAlterada)),
      /repetido con contenido diferente/,
    );

    await simulatorSub.close();
    await produccionSub.close();
    await client.close();
  } finally {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
