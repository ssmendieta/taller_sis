import { PubSubPublisherService } from '../pubsub/pubsub-publisher.service';
import {
  ESTADO_OUTBOX_PENDIENTE,
  ESTADO_OUTBOX_PROCESANDO,
  ESTADO_OUTBOX_PUBLICADO,
  EventoOutbox,
} from './entities/evento-outbox.entity';
import { OutboxPublicadorService } from './outbox-publicador.service';
import { ReclamarEventosOptions, OutboxStore } from './outbox.store';

class OutboxEnMemoria implements OutboxStore {
  constructor(readonly eventos: EventoOutbox[]) {}

  async reclamarPendientes(options: ReclamarEventosOptions): Promise<EventoOutbox[]> {
    const evento = this.eventos.find((actual) =>
      (actual.estado === ESTADO_OUTBOX_PENDIENTE
        && actual.proximoIntentoEn <= options.ahora)
      || (actual.estado === ESTADO_OUTBOX_PROCESANDO
        && actual.bloqueoHasta !== null
        && actual.bloqueoHasta <= options.ahora));
    if (!evento) return [];
    evento.estado = ESTADO_OUTBOX_PROCESANDO;
    evento.intentos += 1;
    evento.ultimoIntentoEn = options.ahora;
    evento.bloqueoToken = 'e39cc663-7d0d-42b1-aa66-d84b9f0309f6';
    evento.bloqueoHasta = new Date(options.ahora.getTime() + options.leaseMs);
    return [evento];
  }

  async marcarPublicado(
    evento: EventoOutbox,
    messageId: string,
    publicadoEn: Date,
  ): Promise<void> {
    evento.estado = ESTADO_OUTBOX_PUBLICADO;
    evento.messageId = messageId;
    evento.publicadoEn = publicadoEn;
    evento.ultimoError = null;
    evento.bloqueoToken = null;
    evento.bloqueoHasta = null;
  }

  async marcarFallo(
    evento: EventoOutbox,
    error: string,
    proximoIntentoEn: Date,
  ): Promise<void> {
    evento.estado = ESTADO_OUTBOX_PENDIENTE;
    evento.ultimoError = error;
    evento.proximoIntentoEn = proximoIntentoEn;
    evento.bloqueoToken = null;
    evento.bloqueoHasta = null;
  }
}

function eventoPendiente(): EventoOutbox {
  return {
    id: '1',
    eventId: 'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6',
    eventType: 'SolicitudMaterialAlmacen.v1',
    correlationId: '81a265f2-15ec-430c-98e5-e1fa08bb7412',
    aggregateType: 'SolicitudMaterial',
    aggregateId: '27',
    payload: {
      eventId: 'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6',
      eventType: 'SolicitudMaterialAlmacen.v1',
      occurredAt: '2026-10-11T18:15:00.000Z',
      source: 'produccion-service',
      correlationId: '81a265f2-15ec-430c-98e5-e1fa08bb7412',
      data: {
        solicitudId: '27',
        solicitudVersion: 1,
        ordenId: 15,
        ordenCodigo: 'ORD-0015',
        solicitanteUsuarioId: '42',
        fechaNecesaria: '2026-10-13',
        items: [{
          materialId: '8',
          materialCodigo: 'HAR-001',
          materialNombre: 'Harina de trigo',
          cantidad: '12.5000',
          unidad: 'kg',
        }],
      },
    },
    estado: ESTADO_OUTBOX_PENDIENTE,
    intentos: 0,
    messageId: null,
    ultimoError: null,
    proximoIntentoEn: new Date('2026-10-11T18:15:00.000Z'),
    ultimoIntentoEn: null,
    bloqueoToken: null,
    bloqueoHasta: null,
    publicadoEn: null,
    creadoEn: new Date('2026-10-11T18:15:00.000Z'),
    actualizadoEn: new Date('2026-10-11T18:15:00.000Z'),
  };
}

describe('ABC-242: publicación durable desde outbox', () => {
  it('guarda el messageId solo después de que Pub/Sub confirma', async () => {
    const evento = eventoPendiente();
    const store = new OutboxEnMemoria([evento]);
    const publishMessage = jest.fn().mockResolvedValue('mensaje-google-1');
    const publisher = new PubSubPublisherService(
      { enabled: true, projectId: 'proyecto', topicId: 'solicitudes' },
      { topic: () => ({ publishMessage }) } as any,
    );
    const service = new OutboxPublicadorService(store, publisher, {
      enabled: false,
      batchSize: 10,
      pollIntervalMs: 5000,
      leaseMs: 30000,
      retryBaseMs: 1000,
      retryMaxMs: 60000,
    });

    await expect(service.procesarPendientes()).resolves.toEqual({
      reclamados: 1,
      publicados: 1,
      fallidos: 0,
    });
    expect(evento).toMatchObject({
      estado: ESTADO_OUTBOX_PUBLICADO,
      messageId: 'mensaje-google-1',
      intentos: 1,
      ultimoError: null,
    });
    await expect(service.procesarPendientes()).resolves.toMatchObject({ reclamados: 0 });
    expect(publishMessage).toHaveBeenCalledTimes(1);
  });

  it('conserva el evento al fallar y reintenta el mismo eventId', async () => {
    const evento = eventoPendiente();
    const store = new OutboxEnMemoria([evento]);
    const publishMessage = jest.fn()
      .mockRejectedValueOnce(new Error('Pub/Sub no disponible'))
      .mockResolvedValueOnce('mensaje-google-2');
    const publisher = new PubSubPublisherService(
      { enabled: true, projectId: 'proyecto', topicId: 'solicitudes' },
      { topic: () => ({ publishMessage }) } as any,
    );
    const service = new OutboxPublicadorService(store, publisher, {
      enabled: false,
      batchSize: 10,
      pollIntervalMs: 5000,
      leaseMs: 30000,
      retryBaseMs: 1000,
      retryMaxMs: 60000,
    });
    const inicio = new Date('2026-10-11T18:15:00.000Z');

    await expect(service.procesarPendientes(inicio)).resolves.toEqual({
      reclamados: 1,
      publicados: 0,
      fallidos: 1,
    });
    expect(evento).toMatchObject({
      estado: ESTADO_OUTBOX_PENDIENTE,
      eventId: 'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6',
      intentos: 1,
      messageId: null,
      ultimoError: 'Pub/Sub no disponible',
      proximoIntentoEn: new Date('2026-10-11T18:15:01.000Z'),
    });
    await expect(service.procesarPendientes(
      new Date('2026-10-11T18:15:00.999Z'),
    )).resolves.toMatchObject({ reclamados: 0 });
    await expect(service.procesarPendientes(
      new Date('2026-10-11T18:15:01.000Z'),
    )).resolves.toEqual({ reclamados: 1, publicados: 1, fallidos: 0 });
    expect(evento).toMatchObject({
      estado: ESTADO_OUTBOX_PUBLICADO,
      intentos: 2,
      messageId: 'mensaje-google-2',
      ultimoError: null,
    });
    expect(publishMessage).toHaveBeenCalledTimes(2);
    expect(publishMessage.mock.calls.map(([message]) =>
      JSON.parse(message.data.toString('utf8')).eventId,
    )).toEqual([
      'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6',
      'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6',
    ]);
  });

  it('recupera una publicación interrumpida cuando vence el lease', async () => {
    const evento = eventoPendiente();
    evento.estado = ESTADO_OUTBOX_PROCESANDO;
    evento.intentos = 1;
    evento.bloqueoToken = '999cc663-7d0d-42b1-aa66-d84b9f0309f6';
    evento.bloqueoHasta = new Date('2026-10-11T18:15:30.000Z');
    const store = new OutboxEnMemoria([evento]);
    const publishMessage = jest.fn().mockResolvedValue('mensaje-recuperado');
    const publisher = new PubSubPublisherService(
      { enabled: true, projectId: 'proyecto', topicId: 'solicitudes' },
      { topic: () => ({ publishMessage }) } as any,
    );
    const service = new OutboxPublicadorService(store, publisher, {
      enabled: false,
      batchSize: 10,
      pollIntervalMs: 5000,
      leaseMs: 30000,
      retryBaseMs: 1000,
      retryMaxMs: 60000,
    });

    await expect(service.procesarPendientes(
      new Date('2026-10-11T18:15:29.999Z'),
    )).resolves.toMatchObject({ reclamados: 0 });
    await expect(service.procesarPendientes(
      new Date('2026-10-11T18:15:30.000Z'),
    )).resolves.toEqual({ reclamados: 1, publicados: 1, fallidos: 0 });
    expect(evento).toMatchObject({
      eventId: 'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6',
      estado: ESTADO_OUTBOX_PUBLICADO,
      intentos: 2,
      messageId: 'mensaje-recuperado',
    });
  });
});
