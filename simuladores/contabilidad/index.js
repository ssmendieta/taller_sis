'use strict';

const path = require('node:path');
const { PubSub } = require('@google-cloud/pubsub');
const { crearRespuesta, MensajePermanenteError, validarEntrada } = require('./contract');
const { StateStore } = require('./state-store');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio`);
  return value;
}

async function main() {
  required('PUBSUB_EMULATOR_HOST');
  const projectId = required('GCP_PROJECT_ID');
  const subscriptionId = required('CONTABILIDAD_INPUT_SUBSCRIPTION_ID');
  const outputTopicId = required('CONTABILIDAD_OUTPUT_TOPIC_ID');
  const statePath = process.env.CONTABILIDAD_STATE_PATH?.trim()
    || path.join(__dirname, 'data', 'state.jsonl');
  const crashAfterSave = /^(true|1|yes)$/i.test(process.env.CONTABILIDAD_SIMULATOR_CRASH_AFTER_SAVE_ONCE || '');
  const client = new PubSub({ projectId });
  const store = new StateStore(statePath);
  await store.load();

  async function publish(response) {
    const messageId = await client.topic(outputTopicId).publishMessage({
      data: Buffer.from(JSON.stringify(response)),
      attributes: {
        eventId: response.eventId,
        eventType: response.eventType,
        source: response.source,
        correlationId: response.correlationId,
      },
    });
    await store.markSent(response.eventId, messageId);
    console.log(JSON.stringify({
      process: 'contabilidad-simulator', action: 'RESPONSE_SENT', messageId,
      eventId: response.eventId, requestEventId: response.data.requestEventId,
      correlationId: response.correlationId, estado: response.data.estado,
    }));
  }

  async function flushPending() {
    for (const response of [...store.pending.values()]) {
      try {
        await publish(response);
      } catch (error) {
        console.error(JSON.stringify({ process: 'contabilidad-simulator', action: 'RESPONSE_PENDING', eventId: response.eventId, error: error.message }));
      }
    }
  }

  await flushPending();
  const subscription = client.subscription(subscriptionId, { flowControl: { maxMessages: 1 } });
  let chain = Promise.resolve();
  subscription.on('message', (message) => {
    chain = chain.then(async () => {
      try {
        const request = validarEntrada(JSON.parse(message.data.toString('utf8')), message.attributes);
        const stored = await store.receive(request, crearRespuesta(request));
        console.log(JSON.stringify({
          process: 'contabilidad-simulator', action: stored.isNew ? 'REQUEST_STORED' : 'REQUEST_DUPLICATE',
          messageId: message.id, eventId: request.eventId,
          responseEventId: stored.response.eventId, correlationId: request.correlationId,
        }));
        if (stored.isNew && crashAfterSave) {
          console.error(JSON.stringify({ process: 'contabilidad-simulator', action: 'CRASH_AFTER_SAVE', eventId: request.eventId }));
          process.exit(86);
        }
        message.ack();
        if (store.pending.has(stored.response.eventId)) await publish(stored.response);
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof MensajePermanenteError) {
          message.ack();
          console.warn(JSON.stringify({ process: 'contabilidad-simulator', action: 'REQUEST_REJECTED', messageId: message.id, error: error.message }));
        } else {
          message.nack();
          console.error(JSON.stringify({ process: 'contabilidad-simulator', action: 'REQUEST_RETRY', messageId: message.id, error: error.message }));
        }
      }
    });
  });
  subscription.on('error', (error) => console.error(JSON.stringify({ process: 'contabilidad-simulator', action: 'SUBSCRIPTION_ERROR', error: error.message })));
  const retry = setInterval(() => void flushPending(), 2000);

  async function shutdown() {
    clearInterval(retry);
    await chain;
    await subscription.close();
    await client.close();
  }
  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));
  console.log(JSON.stringify({ process: 'contabilidad-simulator', action: 'READY', projectId, subscriptionId, outputTopicId, statePath }));
}

main().catch((error) => {
  console.error(JSON.stringify({ process: 'contabilidad-simulator', action: 'FATAL', error: error.message }));
  process.exitCode = 1;
});
