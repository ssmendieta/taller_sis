import { loadPubSubConfig } from './pubsub.config';

describe('Configuración Pub/Sub', () => {
  it('queda deshabilitada por defecto sin exigir credenciales', () => {
    expect(loadPubSubConfig({})).toEqual({
      enabled: false,
      projectId: '',
      topicId: '',
    });
  });

  it('exige proyecto y topic cuando está habilitada', () => {
    expect(() => loadPubSubConfig({ PUBSUB_ENABLED: 'true' })).toThrow(
      'GCP_PROJECT_ID es obligatorio',
    );
  });

  it('acepta el nombre completo del topic y conserva solo su ID', () => {
    expect(
      loadPubSubConfig({
        PUBSUB_ENABLED: 'true',
        GCP_PROJECT_ID: 'proyecto-demo',
        PUBSUB_TOPIC_ID: 'projects/proyecto-demo/topics/topic-unico',
      }),
    ).toEqual({
      enabled: true,
      projectId: 'proyecto-demo',
      topicId: 'topic-unico',
    });
  });

  it('rechaza un topic perteneciente a otro proyecto', () => {
    expect(() =>
      loadPubSubConfig({
        PUBSUB_ENABLED: 'true',
        GCP_PROJECT_ID: 'proyecto-a',
        PUBSUB_TOPIC_ID: 'projects/proyecto-b/topics/topic-unico',
      }),
    ).toThrow('no coincide con GCP_PROJECT_ID');
  });
});
