import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { SolicitudesMaterial1710000000012 } from '../database/migrations/1710000000012-SolicitudesMaterial';
import { EventosOutbox1710000000017 } from '../database/migrations/1710000000017-EventosOutbox';
import { EventosInbox1710000000019 } from '../database/migrations/1710000000019-EventosInbox';
import { Demandas1710000000024 } from '../database/migrations/1710000000024-Demandas';
import { DemandasRechazadas1710000000025 } from '../database/migrations/1710000000025-DemandasRechazadas';
import { EstadoConfirmadaDemanda1710000000026 } from '../database/migrations/1710000000026-EstadoConfirmadaDemanda';
import { ConfirmacionesDemandaPendientes1710000000028 } from '../database/migrations/1710000000028-ConfirmacionesDemandaPendientes';
import { DEMANDA_REGISTRADA_V1 } from '../integraciones/contratos/ventas-demanda-v1';
import { EventoInbox } from '../integraciones/inbox/entities/evento-inbox.entity';
import { DemandaService } from './demanda.service';
import { DemandaItem } from './entities/demanda-item.entity';
import { DemandaRechazada } from './entities/demanda-rechazada.entity';
import { Demanda } from './entities/demanda.entity';
import { ProcesadorDemandaService } from './procesador-demanda.service';
import { PubSubDemandaConsumerService } from './pubsub-demanda-consumer.service';

// ABC-359: verificación de ABC-122 con PostgreSQL real y el consumidor real.
// Los mensajes se entregan al consumidor como lo hace Pub/Sub, sin broker:
// es una prueba local; la publicación real en Google Cloud queda pendiente.
// Se activa con DEMANDA_DB_REAL=1.
const describeReal = process.env.DEMANDA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-359: demanda de Ventas en PostgreSQL', () => {
  const schema = `abc359_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let processor: ProcesadorDemandaService;
  let consumer: PubSubDemandaConsumerService;
  let consulta: DemandaService;
  let creado = false;
  let secuencia = 0;

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      migrations: [],
      entities: [Demanda, DemandaItem, DemandaRechazada, EventoInbox],
      extra: { options: `-c search_path=${schema}` },
    });
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    creado = true;
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      for (const migracion of [
        new ProduccionSchema1710000000002(), new SolicitudesMaterial1710000000012(),
        new EventosOutbox1710000000017(), new EventosInbox1710000000019(),
        new Demandas1710000000024(), new DemandasRechazadas1710000000025(),
        new EstadoConfirmadaDemanda1710000000026(), new ConfirmacionesDemandaPendientes1710000000028(),
      ]) {
        await migracion.up(runner);
      }
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    processor = new ProcesadorDemandaService(source);
    consumer = new PubSubDemandaConsumerService(processor, null, { enabled: false, projectId: 'taller-local', subscriptionId: '' });
    consulta = new DemandaService(source.getRepository(Demanda));
  }, 30000);

  afterAll(async () => {
    if (!source?.isInitialized) return;
    try {
      if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await source.destroy();
    }
  });

  const evento = (data: Record<string, unknown> = {}, eventId = randomUUID()) => ({
    eventId,
    eventType: DEMANDA_REGISTRADA_V1,
    occurredAt: new Date().toISOString(),
    source: 'ventas-service',
    correlationId: randomUUID(),
    data: {
      origen: 'VENTAS',
      demandaExternaId: `PED-359-${++secuencia}`,
      fechaRequerida: '2026-11-20',
      items: [{ productoCodigo: 'GAL-001', cantidad: '40.0000', unidad: 'kg' }],
      ...data,
    },
  });
  const mensaje = (payload: unknown, id = `msg-${randomUUID()}`) => ({
    id, data: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)), ack: jest.fn(), nack: jest.fn(),
  });
  const contar = async (externa: string) => {
    const [fila] = await source.query(
      `SELECT (SELECT COUNT(*)::int FROM demandas WHERE demanda_externa_id = $1) AS demandas,
              (SELECT COUNT(*)::int FROM demandas_items i JOIN demandas d ON d.id = i.demanda_id WHERE d.demanda_externa_id = $1) AS items,
              (SELECT COUNT(*)::int FROM demandas_rechazadas WHERE demanda_externa_id = $1) AS rechazos`,
      [externa]);
    return fila as { demandas: number; items: number; rechazos: number };
  };

  it('válido: commit de demanda RECIBIDA, ítems e inbox antes del ACK, y visible en la consulta', async () => {
    const e = evento({ items: [
      { productoCodigo: 'GAL-001', cantidad: '40', unidad: 'kg' },
      { productoCodigo: 'PAN-001', cantidad: '120', unidad: 'unidad' },
    ] });
    const m = mensaje(e);
    await consumer.procesarMensaje(m);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(await contar(e.data.demandaExternaId as string)).toEqual({ demandas: 1, items: 2, rechazos: 0 });
    const [inbox] = await source.query('SELECT estado, message_id FROM eventos_inbox WHERE event_id = $1', [e.eventId]);
    expect(inbox).toEqual({ estado: 'PROCESADO', message_id: m.id });

    const listado = await consulta.listar({ origen: 'VENTAS', estado: 'RECIBIDA', page: 1, limit: 100 } as any);
    const encontrada = listado.items.find((d) => d.demandaExternaId === e.data.demandaExternaId);
    expect(encontrada).toMatchObject({ estado: 'RECIBIDA', fechaRequerida: '2026-11-20', totalItems: 2 });
    expect(encontrada?.items.map((i) => i.cantidad).sort()).toEqual(['120.0000', '40.0000']);
  });

  it('inválido: rechazo permanente con ACK y motivo trazado, sin demanda', async () => {
    const e = evento({ items: [{ productoCodigo: 'GAL-001', cantidad: '0', unidad: 'cajas' }] });
    const m = mensaje(e);
    await consumer.procesarMensaje(m);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.nack).not.toHaveBeenCalled();
    expect(await contar(e.data.demandaExternaId as string)).toEqual({ demandas: 0, items: 0, rechazos: 1 });
    const [rechazo] = await source.query('SELECT motivo, detalle FROM demandas_rechazadas WHERE event_id = $1', [e.eventId]);
    expect(rechazo.motivo).toBe('EVENTO_INVALIDO');
    expect(rechazo.detalle).toContain('cantidad');
    expect(rechazo.detalle).toContain('unidad');
  });

  it('repetido: redelivery del mismo eventId y mismo pedido con otro eventId no duplican', async () => {
    const e = evento();
    await consumer.procesarMensaje(mensaje(e));
    const redelivery = mensaje(e);
    await consumer.procesarMensaje(redelivery);
    const otroEvento = mensaje({ ...e, eventId: randomUUID(), data: { ...e.data, items: [{ productoCodigo: 'GAL-001', cantidad: '40', unidad: 'kg' }] } });
    await consumer.procesarMensaje(otroEvento);
    expect(redelivery.ack).toHaveBeenCalledTimes(1);
    expect(otroEvento.ack).toHaveBeenCalledTimes(1);
    expect(await contar(e.data.demandaExternaId as string)).toEqual({ demandas: 1, items: 1, rechazos: 0 });
  });

  it('contradictorio: se rechaza y la demanda válida no cambia', async () => {
    const e = evento();
    await consumer.procesarMensaje(mensaje(e));
    const contradictorio = mensaje({ ...e, eventId: randomUUID(), data: { ...e.data, fechaRequerida: '2026-12-01' } });
    await consumer.procesarMensaje(contradictorio);
    expect(contradictorio.ack).toHaveBeenCalledTimes(1);
    const [demanda] = await source.query('SELECT fecha_requerida::text AS fecha FROM demandas WHERE demanda_externa_id = $1', [e.data.demandaExternaId]);
    expect(demanda.fecha).toBe('2026-11-20');
    const [rechazo] = await source.query('SELECT motivo FROM demandas_rechazadas WHERE demanda_externa_id = $1', [e.data.demandaExternaId]);
    expect(rechazo.motivo).toBe('DEMANDA_CONTRADICTORIA');
  });

  it('concurrente: la misma demanda en dos eventos simultáneos queda una sola vez', async () => {
    const e = evento();
    const m1 = mensaje(e);
    const m2 = mensaje({ ...e, eventId: randomUUID() });
    await Promise.all([consumer.procesarMensaje(m1), consumer.procesarMensaje(m2)]);
    expect(m1.ack).toHaveBeenCalledTimes(1);
    expect(m2.ack).toHaveBeenCalledTimes(1);
    expect(await contar(e.data.demandaExternaId as string)).toEqual({ demandas: 1, items: 1, rechazos: 0 });
  });

  it('concurrente: el mismo eventId entregado dos veces a la vez deja un solo inbox', async () => {
    const e = evento();
    const resultados = await Promise.all([processor.procesar(e, 'a'), processor.procesar(e, 'b')]);
    expect(resultados.map((r) => r.resultado).sort()).toEqual(['DUPLICADO', 'PROCESADO']);
    const [{ total }] = await source.query('SELECT COUNT(*)::int AS total FROM eventos_inbox WHERE event_id = $1', [e.eventId]);
    expect(total).toBe(1);
  });

  it('redelivery tras perder el ACK después del commit: NACK y luego un solo efecto', async () => {
    const e = evento();
    const interrumpido = { ...mensaje(e), ack: jest.fn(() => { throw new Error('conexión perdida antes del ACK'); }) };
    await consumer.procesarMensaje(interrumpido);
    expect(interrumpido.nack).toHaveBeenCalledTimes(1);
    expect(await contar(e.data.demandaExternaId as string)).toEqual({ demandas: 1, items: 1, rechazos: 0 });
    const redelivery = mensaje(e);
    await consumer.procesarMensaje(redelivery);
    expect(redelivery.ack).toHaveBeenCalledTimes(1);
    expect(await contar(e.data.demandaExternaId as string)).toEqual({ demandas: 1, items: 1, rechazos: 0 });
  });

  it('fallo transitorio de la base: NACK sin efectos y la entrega posterior se procesa', async () => {
    const e = evento();
    const caida = new Proxy(source, {
      get(target, prop, receiver) {
        if (prop === 'transaction') return async () => { throw new Error('Connection terminated unexpectedly'); };
        const valor = Reflect.get(target, prop, receiver);
        return typeof valor === 'function' ? valor.bind(target) : valor;
      },
    });
    const consumidorCaido = new PubSubDemandaConsumerService(new ProcesadorDemandaService(caida as DataSource), null,
      { enabled: false, projectId: 'taller-local', subscriptionId: '' });
    const durante = mensaje(e);
    await consumidorCaido.procesarMensaje(durante);
    expect(durante.nack).toHaveBeenCalledTimes(1);
    expect(await contar(e.data.demandaExternaId as string)).toEqual({ demandas: 0, items: 0, rechazos: 0 });

    const despues = mensaje(e);
    await consumer.procesarMensaje(despues);
    expect(despues.ack).toHaveBeenCalledTimes(1);
    expect(await contar(e.data.demandaExternaId as string)).toEqual({ demandas: 1, items: 1, rechazos: 0 });
  });

  it('no JSON: ACK sin bucle y sin escribir', async () => {
    const m = mensaje('{esto no es json');
    await consumer.procesarMensaje(m);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.nack).not.toHaveBeenCalled();
  });
});
