import * as dotenv from 'dotenv';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { PubSubModule } from './pubsub.module';
import { PubSubPublisherService } from './pubsub-publisher.service';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

async function run(): Promise<void> {
  const context = await NestFactory.createApplicationContext(PubSubModule, {
    logger: false,
  });

  try {
    const publisher = context.get(PubSubPublisherService);
    const eventId = randomUUID();
    const correlationId = randomUUID();
    const result = await publisher.publish({
      eventId,
      eventType: 'PubSubConnectionTest.v1',
      occurredAt: new Date().toISOString(),
      source: 'produccion-service',
      correlationId,
      data: {
        message: 'Prueba de publicación desde Producción',
      },
    });

    console.log(JSON.stringify({ status: 'PUBLICADO', ...result }, null, 2));
  } finally {
    await context.close();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`No se pudo publicar en Pub/Sub: ${message}`);
  process.exitCode = 1;
});
