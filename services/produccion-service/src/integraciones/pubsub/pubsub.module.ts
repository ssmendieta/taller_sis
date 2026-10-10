import { Module } from '@nestjs/common';
import {
  pubSubClientProvider,
  pubSubConfigProvider,
} from './pubsub-client.provider';
import { PubSubPublisherService } from './pubsub-publisher.service';

@Module({
  providers: [
    pubSubConfigProvider,
    pubSubClientProvider,
    PubSubPublisherService,
  ],
  exports: [PubSubPublisherService],
})
export class PubSubModule {}
