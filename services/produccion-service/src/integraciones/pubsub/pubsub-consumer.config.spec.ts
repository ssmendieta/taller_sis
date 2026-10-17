import { loadPubSubConsumerConfig } from './pubsub-consumer.config';

describe('ABC-244: configuracion del consumidor Pub/Sub', () => {
  it('queda desactivado por defecto sin exigir una suscripcion', () => {
    expect(loadPubSubConsumerConfig({})).toEqual({
      enabled: false, projectId: '', subscriptionId: '',
    });
  });

  it('acepta el nombre completo y conserva solo el ID de la suscripcion', () => {
    expect(loadPubSubConsumerConfig({
      PUBSUB_CONSUMER_ENABLED: 'true',
      GCP_PROJECT_ID: 'proyecto-1',
      PUBSUB_SUBSCRIPTION_ID: 'projects/proyecto-1/subscriptions/respuestas-produccion',
    })).toMatchObject({ enabled: true, subscriptionId: 'respuestas-produccion' });
  });

  it('rechaza una suscripcion de otro proyecto', () => {
    expect(() => loadPubSubConsumerConfig({
      PUBSUB_CONSUMER_ENABLED: 'true',
      GCP_PROJECT_ID: 'proyecto-1',
      PUBSUB_SUBSCRIPTION_ID: 'projects/proyecto-2/subscriptions/respuestas-produccion',
    })).toThrow('no coincide');
  });
});
