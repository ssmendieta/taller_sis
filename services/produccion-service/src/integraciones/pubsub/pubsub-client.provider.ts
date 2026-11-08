import { Provider } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import {
  loadPubSubConfig,
  PUBSUB_CONFIG,
  PubSubConfig,
} from './pubsub.config';
import {
  loadPubSubConsumerConfig,
  PUBSUB_CONSUMER_CONFIG,
  PubSubConsumerConfig,
} from './pubsub-consumer.config';
import {
  loadPubSubContabilidadConsumerConfig,
  PUBSUB_CONTABILIDAD_CONSUMER_CONFIG,
  PubSubContabilidadConsumerConfig,
} from './pubsub-contabilidad-consumer.config';
import {
  loadPubSubDemandaConsumerConfig,
  PUBSUB_DEMANDA_CONSUMER_CONFIG,
  PubSubDemandaConsumerConfig,
} from './pubsub-demanda-consumer.config';
import {
  loadPubSubDemandaConfirmacionConsumerConfig,
  PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG,
  PubSubDemandaConfirmacionConsumerConfig,
} from './pubsub-demanda-confirmacion-consumer.config';

export const PUBSUB_CLIENT = Symbol('PUBSUB_CLIENT');

export const pubSubConfigProvider: Provider = {
  provide: PUBSUB_CONFIG,
  useFactory: loadPubSubConfig,
};

export const pubSubConsumerConfigProvider: Provider = {
  provide: PUBSUB_CONSUMER_CONFIG,
  useFactory: loadPubSubConsumerConfig,
};

export const pubSubContabilidadConsumerConfigProvider: Provider = {
  provide: PUBSUB_CONTABILIDAD_CONSUMER_CONFIG,
  useFactory: loadPubSubContabilidadConsumerConfig,
};

export const pubSubDemandaConsumerConfigProvider: Provider = {
  provide: PUBSUB_DEMANDA_CONSUMER_CONFIG,
  useFactory: loadPubSubDemandaConsumerConfig,
};

export const pubSubDemandaConfirmacionConsumerConfigProvider: Provider = {
  provide: PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG,
  useFactory: loadPubSubDemandaConfirmacionConsumerConfig,
};

export const pubSubClientProvider: Provider = {
  provide: PUBSUB_CLIENT,
  inject: [
    PUBSUB_CONFIG,
    PUBSUB_CONSUMER_CONFIG,
    PUBSUB_CONTABILIDAD_CONSUMER_CONFIG,
    PUBSUB_DEMANDA_CONSUMER_CONFIG,
    PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG,
  ],
  useFactory: (
    config: PubSubConfig,
    consumer: PubSubConsumerConfig,
    contabilidad: PubSubContabilidadConsumerConfig,
    demanda: PubSubDemandaConsumerConfig,
    confirmacion: PubSubDemandaConfirmacionConsumerConfig,
  ): PubSub | null => {
    if (!config.enabled && !consumer.enabled && !contabilidad.enabled && !demanda.enabled && !confirmacion.enabled) {
      return null;
    }

    // Application Default Credentials lee GOOGLE_APPLICATION_CREDENTIALS.
    return new PubSub({
      projectId: confirmacion.projectId || demanda.projectId || contabilidad.projectId || consumer.projectId || config.projectId,
    });
  },
};
