'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

let PubSub;
try {
  PubSub = require('@google-cloud/pubsub').PubSub;
} catch {
  PubSub = require('../../services/produccion-service/node_modules/@google-cloud/pubsub').PubSub;
}

const { SOLICITUD_MATERIAL_ALMACEN_V1 } = require('./contract');
const { StateStore } = require('./state-store');
const { validarEntrada, crearRespuesta } = require('./contract');

const EMULATOR_HOST = process.env.PUBSUB_EMULATOR_HOST || '127.0.0.1:8085';
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'taller-local';
const INPUT_TOPIC = 'taller-solicitudes-material-local';
const INPUT_SUB = 'taller-inventarios-simulator-local';
const OUTPUT_TOPIC = 'taller-inventarios-respuestas-local';
const OUTPUT_SUB = 'taller-produccion-inventarios-local';
const DB_PATH = path.join(__dirname, 'data', 'inventarios-demo.db');

async function runDemo() {
  console.log('=== DEMOSTRACION IDA Y VUELTA: ABC-243 (INVENTARIOS <-> PRODUCCION) ===');
  console.log(`Conectando a emulador Pub/Sub en: ${EMULATOR_HOST} (Proyecto: ${PROJECT_ID})`);

  process.env.PUBSUB_EMULATOR_HOST = EMULATOR_HOST;
  const client = new PubSub({ projectId: PROJECT_ID });

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  const store = new StateStore(DB_PATH);

  const produccionSub = client.subscription(OUTPUT_SUB, { flowControl: { maxMessages: 10 } });
  const simulatorSub = client.subscription(INPUT_SUB, { flowControl: { maxMessages: 1 } });

  // 1. Simular listener del simulador de inventarios
  simulatorSub.on('message', async (message) => {
    try {
      const raw = message.data.toString('utf8');
      const payload = JSON.parse(raw);
      const request = validarEntrada(payload, message.attributes);
      const response = crearRespuesta(request);
      const stored = store.receive(request, response);

      console.log(`[SIMULADOR] Evento recibido: action=${stored.isNew ? 'REQUEST_STORED' : 'REQUEST_DUPLICATE'} ` +
        `solicitudId=${request.data.solicitudId} eventId=${request.eventId} pubsubMessageId=${message.id}`);

      message.ack();

      if (store.isPending(stored.response.eventId)) {
        const respMessageId = await client.topic(OUTPUT_TOPIC).publishMessage({
          data: Buffer.from(JSON.stringify(stored.response), 'utf8'),
          attributes: {
            eventId: stored.response.eventId,
            eventType: stored.response.eventType,
            source: stored.response.source,
            correlationId: stored.response.correlationId,
          },
        });
        store.markSent(stored.response.eventId, respMessageId);
        console.log(`[SIMULADOR] Respuesta publicada: eventId=${stored.response.eventId} ` +
          `pubsubMessageId=${respMessageId} estadoNuevo=${stored.response.data.estadoNuevo} (guardado en SQLite)`);
      }
    } catch (err) {
      console.error(`[SIMULADOR ERROR] ${err.message}`);
      message.nack();
    }
  });

  // 2. Produccion publica una solicitud de material (ABC-73)
  const reqEventId = randomUUID();
  const correlationId = randomUUID();
  const solicitud = {
    eventId: reqEventId,
    eventType: SOLICITUD_MATERIAL_ALMACEN_V1,
    occurredAt: new Date().toISOString(),
    source: 'produccion-service',
    correlationId,
    data: {
      solicitudId: '45',
      solicitudVersion: 1,
      ordenId: 10,
      ordenCodigo: 'ORD-2026-0010',
      solicitanteUsuarioId: '7',
      fechaNecesaria: '2026-10-22',
      items: [
        {
          materialId: '3',
          materialCodigo: 'HAR-001',
          materialNombre: 'Harina de trigo especial',
          cantidad: '50.0000',
          unidad: 'kg',
        },
      ],
    },
  };

  console.log('\n--- PASO 1: Produccion publica SolicitudMaterialAlmacen.v1 ---');
  console.log(`  solicitudId: ${solicitud.data.solicitudId}`);
  console.log(`  ordenId: ${solicitud.data.ordenId}`);
  console.log(`  request eventId: ${solicitud.eventId}`);
  console.log(`  correlationId: ${solicitud.correlationId}`);

  const reqPubMessageId = await client.topic(INPUT_TOPIC).publishMessage({
    data: Buffer.from(JSON.stringify(solicitud)),
    attributes: {
      eventId: solicitud.eventId,
      eventType: solicitud.eventType,
      source: solicitud.source,
      correlationId: solicitud.correlationId,
    },
  });

  console.log(`  -> Confirmada por Pub/Sub con messageId: ${reqPubMessageId}`);

  // 3. Esperar recepcion en Produccion
  console.log('\n--- PASO 2: Produccion espera respuesta SolicitudMaterialAlmacenEstadoActualizado.v1 ---');
  const respuestaRecibida = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout esperando respuesta en Produccion')), 10000);
    produccionSub.on('message', (msg) => {
      clearTimeout(timeout);
      msg.ack();
      resolve({
        payload: JSON.parse(msg.data.toString('utf8')),
        attributes: msg.attributes,
        messageId: msg.id,
      });
    });
  });

  console.log(`  -> Respuesta recibida en Produccion con messageId: ${respuestaRecibida.messageId}`);
  console.log(`  -> response eventId: ${respuestaRecibida.payload.eventId}`);
  console.log(`  -> requestEventId referido: ${respuestaRecibida.payload.data.requestEventId}`);
  console.log(`  -> correlationId: ${respuestaRecibida.payload.correlationId}`);
  console.log(`  -> estadoNuevo: ${respuestaRecibida.payload.data.estadoNuevo}`);
  console.log(`  -> solicitudVersion: ${respuestaRecibida.payload.data.solicitudVersion}`);
  console.log(`  -> motivo: ${respuestaRecibida.payload.data.motivo}`);

  // 4. Probar deduplicacion (redelivery)
  console.log('\n--- PASO 3: Redelivery de la misma solicitud (Deduplicacion) ---');
  const redeliverMsgId = await client.topic(INPUT_TOPIC).publishMessage({
    data: Buffer.from(JSON.stringify(solicitud)),
    attributes: {
      eventId: solicitud.eventId,
      eventType: solicitud.eventType,
      source: solicitud.source,
      correlationId: solicitud.correlationId,
    },
  });
  console.log(`  -> Misma solicitud reenviada a Pub/Sub con messageId: ${redeliverMsgId}`);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 5. Probar caso Rechazo (CANCELADA)
  console.log('\n--- PASO 4: Solicitud con material SIN_STOCK (Rechazo/Cancelacion) ---');
  const solicitudRechazo = {
    ...solicitud,
    eventId: randomUUID(),
    correlationId: randomUUID(),
    data: {
      ...solicitud.data,
      solicitudId: '46',
      items: [
        {
          materialId: '4',
          materialCodigo: 'MAT-SIN_STOCK-99',
          materialNombre: 'Levadura seca agotada',
          cantidad: '5.0000',
          unidad: 'kg',
        },
      ],
    },
  };

  const rechazoProm = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout esperando respuesta de rechazo')), 10000);
    produccionSub.on('message', (msg) => {
      const p = JSON.parse(msg.data.toString('utf8'));
      if (p.data.solicitudId === '46') {
        clearTimeout(timeout);
        msg.ack();
        resolve({ payload: p, messageId: msg.id });
      }
    });
  });

  await client.topic(INPUT_TOPIC).publishMessage({
    data: Buffer.from(JSON.stringify(solicitudRechazo)),
    attributes: {
      eventId: solicitudRechazo.eventId,
      eventType: solicitudRechazo.eventType,
      source: solicitudRechazo.source,
      correlationId: solicitudRechazo.correlationId,
    },
  });

  const resRechazo = await rechazoProm;
  console.log(`  -> Respuesta de rechazo recibida: solicitudId=${resRechazo.payload.data.solicitudId} ` +
    `estadoNuevo=${resRechazo.payload.data.estadoNuevo} motivo="${resRechazo.payload.data.motivo}"`);

  // 6. Cerrar conexiones
  await simulatorSub.close();
  await produccionSub.close();
  await client.close();
  store.close();

  console.log('\n=== DEMOSTRACION COMPLETADA CON EXITO ===');
}

runDemo().catch((err) => {
  console.error('ERROR EN DEMO:', err);
  process.exitCode = 1;
});
