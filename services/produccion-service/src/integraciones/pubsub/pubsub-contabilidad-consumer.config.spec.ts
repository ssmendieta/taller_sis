import { loadPubSubContabilidadConsumerConfig } from './pubsub-contabilidad-consumer.config';

describe('configuracion del consumidor contable', () => {
  it('queda deshabilitado sin exigir recursos', () => {
    expect(loadPubSubContabilidadConsumerConfig({})).toEqual({
      enabled: false, projectId: '', topicId: '', subscriptionId: '',
    });
  });

  it('normaliza topic y suscripcion configurables', () => {
    expect(loadPubSubContabilidadConsumerConfig({
      PUBSUB_CONTABILIDAD_CONSUMER_ENABLED: 'true',
      GCP_PROJECT_ID: 'taller-local',
      PUBSUB_CONTABILIDAD_RESULTADOS_TOPIC_ID: 'projects/taller-local/topics/resultados-local',
      PUBSUB_CONTABILIDAD_RESULTADOS_SUBSCRIPTION_ID: 'projects/taller-local/subscriptions/produccion-local',
    })).toEqual({
      enabled: true,
      projectId: 'taller-local',
      topicId: 'resultados-local',
      subscriptionId: 'produccion-local',
    });
  });
});
