'use strict';

const path = require('node:path');
let PubSub;
try {
  PubSub = require('@google-cloud/pubsub').PubSub;
} catch {
  PubSub = require('../../services/produccion-service/node_modules/@google-cloud/pubsub').PubSub;
}

const { crearRespuesta, MensajePermanenteError, validarEntrada } = require('./contract');
const { StateStore } = require('./state-store');

function envOrDefault(name, defaultValue) {
  const value = process.env[name]?.trim();
  return value || defaultValue;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`La variable de entorno ${name} es obligatoria`);
  }
  return value;
}

async function main() {
  if (process.env.PUBSUB_EMULATOR_HOST) {
    console.log(JSON.stringify({
      process: 'inventarios-simulator',
      action: 'EMULATOR_DETECTED',
      host: process.env.PUBSUB_EMULATOR_HOST,
    }));
  }

  const projectId = envOrDefault('GCP_PROJECT_ID', envOrDefault('TALLER_PUBSUB_PROJECT_ID', 'taller-local'));
  const subscriptionId = envOrDefault('INVENTARIOS_INPUT_SUBSCRIPTION_ID', 'taller-inventarios-simulator-local');
  const outputTopicId = envOrDefault('INVENTARIOS_OUTPUT_TOPIC_ID', 'taller-inventarios-respuestas-local');
  const statePath = envOrDefault('INVENTARIOS_STATE_PATH', path.join(__dirname, 'data', 'inventarios.db'));
  const crashAfterSave = /^(true|1|yes)$/i.test(process.env.INVENTARIOS_SIMULADOR_CRASH_AFTER_SAVE_ONCE || '');

  console.log(JSON.stringify({
    process: 'inventarios-simulator',
    action: 'INITIALIZING',
    projectId,
    subscriptionId,
    outputTopicId,
    statePath,
    crashAfterSave,
  }));

  const client = new PubSub({ projectId });
  const store = new StateStore(statePath);

  async function publish(response) {
    const messageId = await client.topic(outputTopicId).publishMessage({
      data: Buffer.from(JSON.stringify(response), 'utf8'),
      attributes: {
        eventId: response.eventId,
        eventType: response.eventType,
        source: response.source,
        correlationId: response.correlationId,
      },
    });

    store.markSent(response.eventId, messageId);

    console.log(JSON.stringify({
      process: 'inventarios-simulator',
      action: 'RESPONSE_SENT',
      messageId,
      eventId: response.eventId,
      requestEventId: response.data.requestEventId,
      correlationId: response.correlationId,
      estadoNuevo: response.data.estadoNuevo,
      solicitudId: response.data.solicitudId,
    }));

    return messageId;
  }

  async function flushPending() {
    const pending = store.getPendingResponses();
    for (const response of pending) {
      try {
        await publish(response);
      } catch (error) {
        console.error(JSON.stringify({
          process: 'inventarios-simulator',
          action: 'RESPONSE_PENDING_ERROR',
          eventId: response.eventId,
          error: error.message,
        }));
      }
    }
  }

  // Enviar cualquier respuesta pendiente que haya quedado de una ejecucion previa
  await flushPending();

  const subscription = client.subscription(subscriptionId, {
    flowControl: { maxMessages: 1 },
  });

  let chain = Promise.resolve();

  subscription.on('message', (message) => {
    chain = chain.then(async () => {
      try {
        const rawData = message.data.toString('utf8');
        const payload = JSON.parse(rawData);
        const request = validarEntrada(payload, message.attributes);
        const response = crearRespuesta(request);
        const stored = store.receive(request, response);

        console.log(JSON.stringify({
          process: 'inventarios-simulator',
          action: stored.isNew ? 'REQUEST_STORED' : 'REQUEST_DUPLICATE',
          messageId: message.id,
          eventId: request.eventId,
          responseEventId: stored.response.eventId,
          correlationId: request.correlationId,
          solicitudId: request.data.solicitudId,
          estadoNuevo: stored.response.data.estadoNuevo,
        }));

        if (stored.isNew && crashAfterSave) {
          console.error(JSON.stringify({
            process: 'inventarios-simulator',
            action: 'CRASH_AFTER_SAVE',
            eventId: request.eventId,
          }));
          process.exit(86);
        }

        // ACK del mensaje entrante tras asegurar la persistencia en SQLite
        message.ack();

        // Si la respuesta esta pendiente, publicarla de inmediato
        if (store.isPending(stored.response.eventId)) {
          await publish(stored.response);
        }
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof MensajePermanenteError) {
          // Errores permanentes: confirmar para evitar bucles venenosos
          message.ack();
          console.warn(JSON.stringify({
            process: 'inventarios-simulator',
            action: 'REQUEST_REJECTED',
            messageId: message.id,
            error: error.message,
          }));
        } else {
          // Errores transitorios (ej. bloqueo temporal): pedir redelivery
          message.nack();
          console.error(JSON.stringify({
            process: 'inventarios-simulator',
            action: 'REQUEST_RETRY',
            messageId: message.id,
            error: error.message,
          }));
        }
      }
    });
  });

  subscription.on('error', (error) => {
    console.error(JSON.stringify({
      process: 'inventarios-simulator',
      action: 'SUBSCRIPTION_ERROR',
      error: error.message,
    }));
  });

  // Reintento periodico de respuestas pendientes cada 2 segundos
  const retryInterval = setInterval(() => void flushPending(), 2000);

  async function shutdown() {
    clearInterval(retryInterval);
    await chain;
    await subscription.close();
    await client.close();
    store.close();
    console.log(JSON.stringify({
      process: 'inventarios-simulator',
      action: 'SHUTDOWN_COMPLETED',
    }));
  }

  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));

  console.log(JSON.stringify({
    process: 'inventarios-simulator',
    action: 'READY',
    projectId,
    subscriptionId,
    outputTopicId,
    statePath,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    process: 'inventarios-simulator',
    action: 'FATAL',
    error: error.message,
  }));
  process.exitCode = 1;
});
