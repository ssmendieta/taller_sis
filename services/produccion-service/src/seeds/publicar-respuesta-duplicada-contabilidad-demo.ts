import { PubSub } from '@google-cloud/pubsub';
import { AppDataSource } from '../database/data-source';

async function main() {
  const emulator = process.env.PUBSUB_EMULATOR_HOST?.trim();
  const projectId = process.env.GCP_PROJECT_ID?.trim();
  const topicId = process.env.PUBSUB_CONTABILIDAD_RESULTADOS_TOPIC_ID?.trim();
  const database = String(AppDataSource.options.database);
  if (!emulator || emulator.includes('googleapis.com')) throw new Error('Este script exige PUBSUB_EMULATOR_HOST local');
  if (!projectId || !topicId) throw new Error('Falta proyecto o topic local de resultados');
  if (!/^produccion_contabilidad_demo(?:_|$)/.test(database)) throw new Error('Solo se permite sobre la base demo contable');
  await AppDataSource.initialize();
  const client = new PubSub({ projectId });
  try {
    const [row] = await AppDataSource.query(`
      SELECT payload FROM eventos_inbox
      WHERE event_type = 'RegistroContableResultado.v1'
      ORDER BY id LIMIT 1
    `);
    if (!row) throw new Error('No hay respuesta contable para duplicar');
    const event = row.payload;
    const messageId = await client.topic(topicId).publishMessage({
      data: Buffer.from(JSON.stringify(event)),
      attributes: {
        eventId: event.eventId,
        eventType: event.eventType,
        source: event.source,
        correlationId: event.correlationId,
      },
    });
    console.log(JSON.stringify({ eventId: event.eventId, correlationId: event.correlationId, messageId }));
  } finally {
    await client.close();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
