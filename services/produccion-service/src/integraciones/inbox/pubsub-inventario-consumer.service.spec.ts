import { EventEmitter } from 'events';
import { PubSub } from '@google-cloud/pubsub';
import { EventoInventarioV1InvalidoError } from '../contratos/inventario-almacen-v1.validator';
import { SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO } from '../contratos/inventario-almacen-v1';
import { PubSubConsumerConfig } from '../pubsub/pubsub-consumer.config';
import { ProcesadorRespuestaInventarioService } from './procesador-respuesta-inventario.service';
import { PubSubInventarioConsumerService } from './pubsub-inventario-consumer.service';

class SuscripcionFalsa extends EventEmitter {
  close = jest.fn().mockResolvedValue(undefined);
}

function mensaje(data: string) {
  return {
    id: 'mensaje-1', data: Buffer.from(data), attributes: {},
    ack: jest.fn(), nack: jest.fn(),
  };
}

async function siguienteTurno() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('ABC-244: ACK y NACK del consumidor Pub/Sub', () => {
  const config: PubSubConsumerConfig = {
    enabled: true, projectId: 'proyecto-1', subscriptionId: 'respuestas-produccion',
  };

  function crear(procesar: jest.Mock) {
    const subscription = new SuscripcionFalsa();
    const client = { subscription: jest.fn(() => subscription) } as unknown as PubSub;
    const processor = { procesar } as unknown as ProcesadorRespuestaInventarioService;
    const service = new PubSubInventarioConsumerService(processor, client, config);
    service.onModuleInit();
    return { service, subscription };
  }

  it('confirma el mensaje despues de procesarlo', async () => {
    const procesar = jest.fn().mockResolvedValue({
      resultado: 'PROCESADO', eventId: SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO.eventId,
      solicitudId: '27',
    });
    const { service, subscription } = crear(procesar);
    const msg = mensaje(JSON.stringify(SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO));
    subscription.emit('message', msg);
    await siguienteTurno();

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.nack).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });

  it('confirma un rechazo permanente para evitar un mensaje venenoso', async () => {
    const procesar = jest.fn().mockRejectedValue(new EventoInventarioV1InvalidoError(
      'SolicitudMaterialAlmacenEstadoActualizado.v1', 'evento-1',
      [{ campo: 'data', motivo: 'invalido' }],
    ));
    const { service, subscription } = crear(procesar);
    const msg = mensaje('{}');
    subscription.emit('message', msg);
    await siguienteTurno();

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.nack).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });

  it('solicita redelivery ante un fallo transitorio', async () => {
    const procesar = jest.fn().mockRejectedValue(new Error('PostgreSQL no disponible'));
    const { service, subscription } = crear(procesar);
    const msg = mensaje('{}');
    subscription.emit('message', msg);
    await siguienteTurno();

    expect(msg.nack).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });
});
