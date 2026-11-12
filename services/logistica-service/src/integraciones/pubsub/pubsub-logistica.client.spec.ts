import { DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO } from '../contratos/inventarios-salida-v1';
import { PubSubLogisticaPublisher } from './pubsub-logistica.client';
import { loadPubSubLogisticaConfig } from './pubsub-logistica.config';

const config = (extra: Record<string, string> = {}) => loadPubSubLogisticaConfig({
  LOGISTICA_PUBSUB_ENABLED: 'true', GCP_PROJECT_ID: 'p', LOGISTICA_PUBSUB_SALIDA_TOPIC_ID: 'salida', ...extra,
});

describe('ABC-386: publicador de Logística', () => {
  it('publica con atributos iguales al cuerpo y devuelve el messageId', async () => {
    const publishMessage = jest.fn().mockResolvedValue('msg-1');
    const topic = jest.fn(() => ({ publishMessage }));
    const resultado = await new PubSubLogisticaPublisher(config(), { topic } as any).publicar(DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO);
    expect(resultado).toEqual({ messageId: 'msg-1', topicId: 'salida' });
    expect(topic).toHaveBeenCalledWith('salida', { gaxOpts: { timeout: 10000 } });
    const { attributes, data } = publishMessage.mock.calls[0][0];
    expect(attributes).toEqual({
      eventId: DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO.eventId, eventType: 'DespachoRutaRegistrado.v1',
      source: 'logistica-service', correlationId: DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO.correlationId,
    });
    expect(JSON.parse(data.toString())).toEqual(DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO);
  });

  it('con el broker sin responder falla al vencer el tiempo máximo en vez de quedar colgado', async () => {
    const topic = () => ({ publishMessage: () => new Promise(() => undefined) });
    const publicador = new PubSubLogisticaPublisher(config({ LOGISTICA_PUBSUB_PUBLISH_TIMEOUT_MS: '50' }), { topic } as any);
    const inicio = Date.now();
    await expect(publicador.publicar(DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO)).rejects.toThrow('DEADLINE_EXCEEDED');
    expect(Date.now() - inicio).toBeLessThan(2000);
  });

  it('el tiempo máximo debe ser menor que el lease y la publicación deshabilitada falla', async () => {
    expect(() => config({ LOGISTICA_PUBSUB_PUBLISH_TIMEOUT_MS: '30000' })).toThrow('menor que OUTBOX_LEASE_MS');
    const apagado = new PubSubLogisticaPublisher(loadPubSubLogisticaConfig({}), null);
    await expect(apagado.publicar(DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO)).rejects.toThrow('deshabilitada');
  });

  it('reutiliza los recursos Pub/Sub compartidos cuando Logistica no tiene recursos exclusivos', () => {
    const compartida = loadPubSubLogisticaConfig({
      GCP_PROJECT_ID: 'p',
      PUBSUB_TOPIC_ID: 'topic-compartido',
      PUBSUB_SUBSCRIPTION_ID: 'suscripcion-compartida',
      LOGISTICA_PUBSUB_SALIDA_TOPIC_ID: ' ',
      LOGISTICA_PUBSUB_RESULTADO_SUBSCRIPTION_ID: '',
      LOGISTICA_PUBSUB_ENABLED: 'true',
      LOGISTICA_PUBSUB_RESULTADO_CONSUMER_ENABLED: 'true',
    });

    expect(compartida.publicacion.topicId).toBe('topic-compartido');
    expect(compartida.resultado.subscriptionId).toBe('suscripcion-compartida');
  });

  it('prioriza los recursos exclusivos de Logistica cuando estan configurados', () => {
    const exclusiva = config({
      PUBSUB_TOPIC_ID: 'topic-compartido',
      LOGISTICA_PUBSUB_SALIDA_TOPIC_ID: 'topic-logistica',
    });

    expect(exclusiva.publicacion.topicId).toBe('topic-logistica');
  });
});
