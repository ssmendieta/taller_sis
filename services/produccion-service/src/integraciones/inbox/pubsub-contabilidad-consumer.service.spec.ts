import { EventEmitter } from 'events';
import { PubSub } from '@google-cloud/pubsub';
import { REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO } from '../contratos/contabilidad-v1';
import { PubSubContabilidadConsumerConfig } from '../pubsub/pubsub-contabilidad-consumer.config';
import { ProcesadorResultadoContableService } from './procesador-resultado-contable.service';
import { PubSubContabilidadConsumerService } from './pubsub-contabilidad-consumer.service';

class SuscripcionFalsa extends EventEmitter {
  close = jest.fn().mockResolvedValue(undefined);
}

function mensaje(payload: unknown, attributes = true) {
  const evento = payload as Record<string, any>;
  return {
    id: 'mensaje-contable-1',
    data: Buffer.from(JSON.stringify(payload)),
    attributes: attributes ? {
      eventId: evento.eventId,
      eventType: evento.eventType,
      correlationId: evento.correlationId,
      source: evento.source,
    } : {},
    ack: jest.fn(),
    nack: jest.fn(),
  };
}

async function turno() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('ABC-252: ACK/NACK del resultado contable', () => {
  const config: PubSubContabilidadConsumerConfig = {
    enabled: true,
    projectId: 'taller-local',
    topicId: 'resultados-local',
    subscriptionId: 'produccion-resultados-local',
  };

  function crear(procesar: jest.Mock) {
    const subscription = new SuscripcionFalsa();
    const client = { subscription: jest.fn(() => subscription) } as unknown as PubSub;
    const processor = { procesar } as unknown as ProcesadorResultadoContableService;
    const service = new PubSubContabilidadConsumerService(processor, client, config);
    service.onModuleInit();
    return { service, subscription };
  }

  it('hace ACK solo despues del guardado', async () => {
    let resolver: (value: unknown) => void;
    const procesar = jest.fn(() => new Promise((resolve) => { resolver = resolve; }));
    const { service, subscription } = crear(procesar);
    const msg = mensaje(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO);
    subscription.emit('message', msg);
    await turno();
    expect(msg.ack).not.toHaveBeenCalled();
    resolver!({ resultado: 'PROCESADO', eventId: REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO.eventId, cierreId: '1' });
    await turno();
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.nack).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });

  it('hace ACK a mensaje invalido y NACK a fallo transitorio', async () => {
    const permanente = crear(jest.fn());
    const invalido = mensaje(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO, false);
    permanente.subscription.emit('message', invalido);
    await turno();
    expect(invalido.ack).toHaveBeenCalledTimes(1);
    await permanente.service.onModuleDestroy();

    const transitorio = crear(jest.fn().mockRejectedValue(new Error('PostgreSQL no disponible')));
    const reintentable = mensaje(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO);
    transitorio.subscription.emit('message', reintentable);
    await turno();
    expect(reintentable.nack).toHaveBeenCalledTimes(1);
    expect(reintentable.ack).not.toHaveBeenCalled();
    await transitorio.service.onModuleDestroy();
  });

  it('tolera interrupcion despues del commit y confirma la redelivery duplicada', async () => {
    const procesar = jest.fn()
      .mockResolvedValueOnce({ resultado: 'PROCESADO', eventId: REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO.eventId, cierreId: '1' })
      .mockResolvedValueOnce({ resultado: 'DUPLICADO', eventId: REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO.eventId, cierreId: '1' });
    const { service, subscription } = crear(procesar);
    const primera = mensaje(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO);
    primera.ack.mockImplementationOnce(() => { throw new Error('proceso interrumpido antes de confirmar'); });
    subscription.emit('message', primera);
    await turno();
    expect(primera.nack).toHaveBeenCalledTimes(1);

    const redelivery = mensaje(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO);
    subscription.emit('message', redelivery);
    await turno();
    expect(redelivery.ack).toHaveBeenCalledTimes(1);
    expect(procesar).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
  });
});
