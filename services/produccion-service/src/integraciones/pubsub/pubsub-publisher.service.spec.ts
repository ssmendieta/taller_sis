import { PubSubPublisherService } from './pubsub-publisher.service';
import { PubSubEvent } from './pubsub.types';

describe('PubSubPublisherService', () => {
  const event: PubSubEvent<{ message: string }> = {
    eventId: 'evento-1',
    eventType: 'PubSubConnectionTest.v1',
    occurredAt: '2026-10-10T15:00:00.000Z',
    source: 'produccion-service',
    correlationId: 'correlacion-1',
    data: { message: 'Prueba' },
  };

  it('publica JSON con atributos de trazabilidad y devuelve messageId', async () => {
    const publishMessage = jest.fn().mockResolvedValue('mensaje-google-1');
    const topic = jest.fn().mockReturnValue({ publishMessage });
    const service = new PubSubPublisherService(
      {
        enabled: true,
        projectId: 'proyecto-demo',
        topicId: 'topic-unico',
      },
      { topic } as any,
    );

    await expect(service.publish(event)).resolves.toEqual({
      eventId: 'evento-1',
      correlationId: 'correlacion-1',
      messageId: 'mensaje-google-1',
      topicId: 'topic-unico',
    });

    expect(topic).toHaveBeenCalledWith('topic-unico');
    const published = publishMessage.mock.calls[0][0];
    expect(JSON.parse(published.data.toString('utf8'))).toEqual(event);
    expect(published.attributes).toEqual({
      eventId: 'evento-1',
      eventType: 'PubSubConnectionTest.v1',
      source: 'produccion-service',
      correlationId: 'correlacion-1',
    });
  });

  it('no publica cuando la integración está deshabilitada', async () => {
    const service = new PubSubPublisherService(
      { enabled: false, projectId: '', topicId: '' },
      null,
    );

    await expect(service.publish(event)).rejects.toThrow('deshabilitada');
  });

  it('rechaza mensajes sin identificadores', async () => {
    const publishMessage = jest.fn();
    const service = new PubSubPublisherService(
      {
        enabled: true,
        projectId: 'proyecto-demo',
        topicId: 'topic-unico',
      },
      { topic: () => ({ publishMessage }) } as any,
    );

    await expect(
      service.publish({ ...event, eventId: '' }),
    ).rejects.toThrow('requiere eventId');
    expect(publishMessage).not.toHaveBeenCalled();
  });
});
