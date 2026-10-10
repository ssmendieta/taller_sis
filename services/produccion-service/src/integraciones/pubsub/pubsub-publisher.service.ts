import { Inject, Injectable } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import { PUBSUB_CLIENT } from './pubsub-client.provider';
import { PUBSUB_CONFIG, PubSubConfig } from './pubsub.config';
import { PubSubEvent, PubSubPublicationResult } from './pubsub.types';

@Injectable()
export class PubSubPublisherService {
  constructor(
    @Inject(PUBSUB_CONFIG) private readonly config: PubSubConfig,
    @Inject(PUBSUB_CLIENT) private readonly client: PubSub | null,
  ) {}

  async publish<T>(event: PubSubEvent<T>): Promise<PubSubPublicationResult> {
    if (!this.config.enabled || !this.client) {
      throw new Error('La publicación Pub/Sub está deshabilitada');
    }

    this.validateEvent(event);

    const messageId = await this.client
      .topic(this.config.topicId)
      .publishMessage({
        data: Buffer.from(JSON.stringify(event), 'utf8'),
        attributes: {
          eventId: event.eventId,
          eventType: event.eventType,
          source: event.source,
          correlationId: event.correlationId,
        },
      });

    return {
      eventId: event.eventId,
      correlationId: event.correlationId,
      messageId,
      topicId: this.config.topicId,
    };
  }

  private validateEvent(event: PubSubEvent<unknown>): void {
    const requiredFields: Array<keyof PubSubEvent> = [
      'eventId',
      'eventType',
      'occurredAt',
      'source',
      'correlationId',
    ];

    for (const field of requiredFields) {
      const value = event[field];
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`El mensaje Pub/Sub requiere ${field}`);
      }
    }
  }
}
