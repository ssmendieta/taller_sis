import { Module } from '@nestjs/common';
import {
  pubSubClientProvider,
  pubSubConfigProvider,
} from './pubsub-client.provider';
import { PubSubPublisherService } from './pubsub-publisher.service';
import { PUBSUB_CONFIG } from './pubsub.config';

@Module({
  providers: [
    pubSubConfigProvider,
    pubSubClientProvider,
    PubSubPublisherService,
  ],
  exports: [PubSubPublisherService, PUBSUB_CONFIG],
})
export class PubSubModule {}
