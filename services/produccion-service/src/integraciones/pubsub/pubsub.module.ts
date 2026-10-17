import { Module } from '@nestjs/common';
import {
  pubSubClientProvider,
  pubSubConsumerConfigProvider,
  pubSubConfigProvider,
} from './pubsub-client.provider';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PUBSUB_CONFIG } from './pubsub.config';
import { PUBSUB_CONSUMER_CONFIG } from './pubsub-consumer.config';
import { PUBSUB_CLIENT } from './pubsub-client.provider';

@Module({
  providers: [
    pubSubConfigProvider,
    pubSubConsumerConfigProvider,
    pubSubClientProvider,
    PubSubPublisherService,
  ],
  exports: [PubSubPublisherService, PUBSUB_CONFIG, PUBSUB_CONSUMER_CONFIG, PUBSUB_CLIENT],
})
export class PubSubModule {}
