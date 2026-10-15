import { PubSubPublisherService } from './pubsub-publisher.service';
import { PubSubEvent } from './pubsub.types';
import { SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO } from '../contratos/inventario-almacen-v1';
import { EventoInventarioV1InvalidoError } from '../contratos/inventario-almacen-v1.validator';

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

  it('diagnostica y no publica un evento de Inventarios invalido', async () => {
    const publishMessage = jest.fn();
    const service = new PubSubPublisherService(
      {
        enabled: true,
        projectId: 'proyecto-demo',
        topicId: 'topic-unico',
      },
      { topic: () => ({ publishMessage }) } as any,
    );
    const warn = jest.fn();
    (service as any).logger.warn = warn;
    const evento = JSON.parse(JSON.stringify(
      SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
    ));
    evento.data.items[0].unidad = 'kilos';

    await expect(service.publish(evento)).rejects.toBeInstanceOf(
      EventoInventarioV1InvalidoError,
    );
    expect(publishMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(
      'EVENTO_INVENTARIO_V1_INVALIDO',
    ));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(
      'data.items[0].unidad',
    ));
  });

  it('no publica una version no soportada del contrato de Inventarios', async () => {
    const publishMessage = jest.fn();
    const service = new PubSubPublisherService(
      {
        enabled: true,
        projectId: 'proyecto-demo',
        topicId: 'topic-unico',
      },
      { topic: () => ({ publishMessage }) } as any,
    );
    (service as any).logger.warn = jest.fn();
    const evento = JSON.parse(JSON.stringify(
      SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
    ));
    evento.eventType = 'SolicitudMaterialAlmacen.v2';

    await expect(service.publish(evento)).rejects.toBeInstanceOf(
      EventoInventarioV1InvalidoError,
    );
    expect(publishMessage).not.toHaveBeenCalled();
  });
});
