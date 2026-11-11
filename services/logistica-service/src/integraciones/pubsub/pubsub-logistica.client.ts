import { Inject, Injectable, Provider } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import { EventoPubSubV1 } from '../contratos/inventarios-salida-v1';
import { PUBSUB_LOGISTICA_CONFIG, PubSubLogisticaConfig, loadPubSubLogisticaConfig } from './pubsub-logistica.config';

export const PUBSUB_LOGISTICA_CLIENT = Symbol('PUBSUB_LOGISTICA_CLIENT');

export const pubSubLogisticaConfigProvider: Provider = {
  provide: PUBSUB_LOGISTICA_CONFIG,
  useFactory: () => loadPubSubLogisticaConfig(),
};

// Sin publicación ni consumo activos no se crea cliente. Las credenciales se leen
// de GOOGLE_APPLICATION_CREDENTIALS o, en local, de PUBSUB_EMULATOR_HOST.
export const pubSubLogisticaClientProvider: Provider = {
  provide: PUBSUB_LOGISTICA_CLIENT,
  inject: [PUBSUB_LOGISTICA_CONFIG],
  useFactory: (config: PubSubLogisticaConfig): PubSub | null =>
    config.publicacion.enabled || config.resultado.enabled ? new PubSub({ projectId: config.projectId }) : null,
};

export interface PublicacionConfirmada {
  messageId: string;
  topicId: string;
}

@Injectable()
export class PubSubLogisticaPublisher {
  constructor(
    @Inject(PUBSUB_LOGISTICA_CONFIG) private readonly config: PubSubLogisticaConfig,
    @Inject(PUBSUB_LOGISTICA_CLIENT) private readonly client: PubSub | null,
  ) {}

  /** Devuelve el messageId que asigna Pub/Sub; publicar no implica que el receptor procesó el mensaje. */
  async publicar(evento: EventoPubSubV1<unknown>): Promise<PublicacionConfirmada> {
    if (!this.config.publicacion.enabled || !this.client) {
      throw new Error('La publicación Pub/Sub de Logística está deshabilitada');
    }
    const messageId = await this.client.topic(this.config.publicacion.topicId).publishMessage({
      data: Buffer.from(JSON.stringify(evento), 'utf8'),
      attributes: {
        eventId: evento.eventId,
        eventType: evento.eventType,
        source: evento.source,
        correlationId: evento.correlationId,
      },
    });
    return { messageId, topicId: this.config.publicacion.topicId };
  }
}
