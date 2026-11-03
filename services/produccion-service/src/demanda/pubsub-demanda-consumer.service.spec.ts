import { DEMANDA_REGISTRADA_V1_EJEMPLO } from '../integraciones/contratos/ventas-demanda-v1';
import { EventoDemandaV1InvalidoError, validarSobreDemandaV1 } from '../integraciones/contratos/ventas-demanda-v1.validator';
import { loadPubSubDemandaConsumerConfig } from '../integraciones/pubsub/pubsub-demanda-consumer.config';
import { DemandaItem } from './entities/demanda-item.entity';
import { Demanda } from './entities/demanda.entity';
import { ConflictoEventoDemandaError, ProcesadorDemandaService } from './procesador-demanda.service';
import { PubSubDemandaConsumerService } from './pubsub-demanda-consumer.service';
import { EventoInbox } from '../integraciones/inbox/entities/evento-inbox.entity';

const evento = () => JSON.parse(JSON.stringify(DEMANDA_REGISTRADA_V1_EJEMPLO));
const mensaje = (payload: unknown) => ({
  id: 'msg-1',
  data: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
  ack: jest.fn(),
  nack: jest.fn(),
});

describe('ABC-356: configuración del consumidor de demandas', () => {
  it('queda desactivado por defecto', () => {
    expect(loadPubSubDemandaConsumerConfig({}).enabled).toBe(false);
  });

  it('exige proyecto y suscripción al activarse y normaliza el nombre completo', () => {
    expect(() => loadPubSubDemandaConsumerConfig({ PUBSUB_DEMANDA_CONSUMER_ENABLED: 'true' })).toThrow(/GCP_PROJECT_ID/);
    expect(loadPubSubDemandaConsumerConfig({
      PUBSUB_DEMANDA_CONSUMER_ENABLED: 'true',
      GCP_PROJECT_ID: 'taller-local',
      PUBSUB_DEMANDA_SUBSCRIPTION_ID: 'projects/taller-local/subscriptions/taller-produccion-demanda',
    })).toEqual({ enabled: true, projectId: 'taller-local', subscriptionId: 'taller-produccion-demanda' });
  });
});

describe('ABC-356: validación del sobre versionado', () => {
  it('acepta el ejemplo del contrato', () => {
    expect(validarSobreDemandaV1(evento()).eventId).toBe(DEMANDA_REGISTRADA_V1_EJEMPLO.eventId);
  });

  it('rechaza otro tipo de evento, ids no UUID o sin ítems', () => {
    expect(() => validarSobreDemandaV1({ ...evento(), eventType: 'Otro.v1' })).toThrow(EventoDemandaV1InvalidoError);
    expect(() => validarSobreDemandaV1({ ...evento(), eventId: '123' })).toThrow(EventoDemandaV1InvalidoError);
    expect(() => validarSobreDemandaV1({ ...evento(), data: { ...evento().data, items: [] } })).toThrow(EventoDemandaV1InvalidoError);
  });
});

describe('ABC-356: ProcesadorDemandaService', () => {
  let manager: any;
  let inbox: EventoInbox | null;
  let service: ProcesadorDemandaService;

  beforeEach(() => {
    inbox = null;
    manager = {
      findOne: jest.fn(async (entity: unknown) => entity === EventoInbox ? inbox : { id: '10' }),
      create: jest.fn((_e: unknown, value: unknown) => value),
      save: jest.fn(async (entity: unknown, value: any) => entity === Demanda ? { id: '10', ...value } : value),
    };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)), manager };
    service = new ProcesadorDemandaService(dataSource as any);
  });

  it('un mensaje válido crea demanda RECIBIDA, ítems e inbox en la misma transacción', async () => {
    await expect(service.procesar(evento(), 'msg-1')).resolves.toEqual({
      resultado: 'PROCESADO', eventId: DEMANDA_REGISTRADA_V1_EJEMPLO.eventId, demandaId: '10',
    });
    const entidades = manager.save.mock.calls.map(([e]: [unknown]) => e);
    expect(entidades).toEqual([Demanda, DemandaItem, EventoInbox]);
    expect(manager.save.mock.calls[0][1]).toMatchObject({ estado: 'RECIBIDA', origen: 'VENTAS', demandaExternaId: 'PED-2026-0042' });
    expect(manager.save.mock.calls[1][1]).toHaveLength(2);
    expect(manager.save.mock.calls[2][1]).toMatchObject({ estado: 'PROCESADO', messageId: 'msg-1' });
  });

  it('una redelivery del mismo evento no duplica registros', async () => {
    const primero = await service.procesar(evento(), 'msg-1');
    inbox = { payloadHash: manager.save.mock.calls[2][1].payloadHash } as EventoInbox;
    manager.save.mockClear();
    await expect(service.procesar(evento(), 'msg-2')).resolves.toEqual({ ...primero, resultado: 'DUPLICADO' });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('el mismo eventId con otro contenido es un conflicto permanente', async () => {
    inbox = { payloadHash: 'otro' } as EventoInbox;
    await expect(service.procesar(evento())).rejects.toBeInstanceOf(ConflictoEventoDemandaError);
  });

  it('una entrega concurrente que choca con la unicidad del inbox se resuelve como duplicado', async () => {
    const choque = Object.assign(new Error('duplicate key'), { driverError: { code: '23505', constraint: 'uq_eventos_inbox_event_id' } });
    const dataSource = {
      transaction: jest.fn().mockRejectedValue(choque),
      manager: { ...manager, findOne: jest.fn(async (entity: unknown) => entity === EventoInbox ? { payloadHash: hash } : { id: '10' }) },
    };
    let hash = '';
    const svc = new ProcesadorDemandaService(dataSource as any);
    await service.procesar(evento());
    hash = manager.save.mock.calls[2][1].payloadHash;
    await expect(svc.procesar(evento())).resolves.toMatchObject({ resultado: 'DUPLICADO', demandaId: '10' });
  });
});

describe('ABC-356: PubSubDemandaConsumerService', () => {
  const consumidor = (procesar: jest.Mock) =>
    new PubSubDemandaConsumerService({ procesar } as any, null, { enabled: false, projectId: '', subscriptionId: '' });

  it('hace ACK solo después de que el procesamiento terminó', async () => {
    let liberar!: () => void;
    const procesar = jest.fn(() => new Promise((ok) => { liberar = () => ok({ resultado: 'PROCESADO', eventId: 'e', demandaId: '1' }); }));
    const m = mensaje(evento());
    const pendiente = consumidor(procesar).procesarMensaje(m);
    await Promise.resolve();
    expect(m.ack).not.toHaveBeenCalled();
    liberar();
    await pendiente;
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.nack).not.toHaveBeenCalled();
  });

  it('un fallo transitorio hace NACK para que Pub/Sub vuelva a entregar', async () => {
    const m = mensaje(evento());
    await consumidor(jest.fn().mockRejectedValue(new Error('connection terminated'))).procesarMensaje(m);
    expect(m.nack).toHaveBeenCalledTimes(1);
    expect(m.ack).not.toHaveBeenCalled();
  });

  it('un error permanente se confirma sin bucle infinito', async () => {
    const m = mensaje('{no es json');
    await consumidor(jest.fn()).procesarMensaje(m);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.nack).not.toHaveBeenCalled();

    const m2 = mensaje(evento());
    await consumidor(jest.fn().mockRejectedValue(new EventoDemandaV1InvalidoError('x', []))).procesarMensaje(m2);
    expect(m2.ack).toHaveBeenCalledTimes(1);
  });
});
