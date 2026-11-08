import { Module } from '@nestjs/common';
import {
  pubSubClientProvider,
  pubSubContabilidadConsumerConfigProvider,
  pubSubConsumerConfigProvider,
  pubSubConfigProvider,
  pubSubDemandaConsumerConfigProvider,
  pubSubDemandaConfirmacionConsumerConfigProvider,
} from './pubsub-client.provider';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PUBSUB_CONFIG } from './pubsub.config';
import { PUBSUB_CONSUMER_CONFIG } from './pubsub-consumer.config';
import { PUBSUB_CLIENT } from './pubsub-client.provider';
import { PUBSUB_CONTABILIDAD_CONSUMER_CONFIG } from './pubsub-contabilidad-consumer.config';
import { PUBSUB_DEMANDA_CONSUMER_CONFIG } from './pubsub-demanda-consumer.config';
import { PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG } from './pubsub-demanda-confirmacion-consumer.config';

@Module({
  providers: [
    pubSubConfigProvider,
    pubSubConsumerConfigProvider,
    pubSubContabilidadConsumerConfigProvider,
    pubSubDemandaConsumerConfigProvider,
    pubSubDemandaConfirmacionConsumerConfigProvider,
    pubSubClientProvider,
    PubSubPublisherService,
  ],
  exports: [
    PubSubPublisherService,
    PUBSUB_CONFIG,
    PUBSUB_CONSUMER_CONFIG,
    PUBSUB_CONTABILIDAD_CONSUMER_CONFIG,
    PUBSUB_DEMANDA_CONSUMER_CONFIG,
    PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_CONFIG,
    PUBSUB_CLIENT,
  ],
})
export class PubSubModule {}
