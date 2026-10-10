import { Provider } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import {
  loadPubSubConfig,
  PUBSUB_CONFIG,
  PubSubConfig,
} from './pubsub.config';

export const PUBSUB_CLIENT = Symbol('PUBSUB_CLIENT');

export const pubSubConfigProvider: Provider = {
  provide: PUBSUB_CONFIG,
  useFactory: loadPubSubConfig,
};

export const pubSubClientProvider: Provider = {
  provide: PUBSUB_CLIENT,
  inject: [PUBSUB_CONFIG],
  useFactory: (config: PubSubConfig): PubSub | null => {
    if (!config.enabled) {
      return null;
    }

    // Application Default Credentials lee GOOGLE_APPLICATION_CREDENTIALS.
    return new PubSub({ projectId: config.projectId });
  },
};
