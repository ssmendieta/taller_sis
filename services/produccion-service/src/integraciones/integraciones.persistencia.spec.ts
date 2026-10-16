import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { EventosOutbox1710000000017 } from '../database/migrations/1710000000017-EventosOutbox';
import { IntegracionesService } from './integraciones.service';
import { EventoOutbox } from './outbox/entities/evento-outbox.entity';
import { TypeOrmOutboxStore } from './outbox/typeorm-outbox.store';
import { OutboxPublicadorService } from './outbox/outbox-publicador.service';
import { PubSubPublisherService } from './pubsub/pubsub-publisher.service';

const describeReal = process.env.OUTBOX_DB_REAL === '1' ? describe : describe.skip;
describeReal('ABC-267: administración persistente en PostgreSQL', () => {
  const schema = `abc267_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let service: IntegracionesService;
  let worker: TypeOrmOutboxStore;
  beforeAll(async () => {
    source = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions),
      schema, migrations: [], entities: [EventoOutbox] });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new EventosOutbox1710000000017().up(runner);
      await runner.commitTransaction();
    } catch (error) { await runner.rollbackTransaction(); throw error; }
    finally { await runner.release(); }
    service = new IntegracionesService(source, { enabled: false, projectId: 'test', topicId: 'eventos' });
    worker = new TypeOrmOutboxStore(source);
  }, 30000);
  beforeEach(async () => { await source.query(`TRUNCATE "${schema}".eventos_outbox RESTART IDENTITY`); });
  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await source.destroy();
    }
  });
  async function seed(extra: Partial<EventoOutbox> = {}) {
    const eventId = randomUUID();
    return source.getRepository(EventoOutbox).save(source.getRepository(EventoOutbox).create({
      eventId, correlationId: randomUUID(), eventType: 'SolicitudMaterialAlmacen.v1',
      aggregateType: 'SolicitudMaterial', aggregateId: randomUUID(),
      payload: { eventId, eventType: 'SolicitudMaterialAlmacen.v1', occurredAt: new Date().toISOString(),
        source: 'produccion-service', correlationId: randomUUID(), data: { privado: 'no exponer' } },
      proximoIntentoEn: new Date(Date.now() + 60000), ...extra,
    }));
  }

  it('pagina con orden estable, filtra y excluye payload y tokens', async () => {
    const primero = await seed({ creadoEn: new Date('2026-10-14T12:00:00.000Z') });
    const segundo = await seed({ creadoEn: primero.creadoEn });
    await seed({ estado: 'PUBLICADO' });
    const pagina = await service.listar({ estado: 'PENDIENTE', limit: '1', page: '1' });
    expect(pagina).toMatchObject({ total: 2, page: 1, limit: 1, items: [{ id: segundo.id }] });
    expect(pagina.items[0]).not.toHaveProperty('payload');
    expect(pagina.items[0]).not.toHaveProperty('bloqueoToken');
    expect((await service.listar({ estado: 'PENDIENTE', limit: '1', page: '2' })).items[0].id).toBe(primero.id);
  });

  it('reintentos repetidos conservan evento, diagnóstico e intentos y permiten reclamarlo una vez', async () => {
    const evento = await seed({ intentos: 2, ultimoError: 'PubSub no disponible' });
    await Promise.all([service.reintentar(evento.id), service.reintentar(evento.id)]);
    const lista = await service.listar({});
    expect(lista).toMatchObject({ total: 1, items: [{ eventId: evento.eventId,
      correlationId: evento.correlationId, intentos: 2, ultimoError: 'PubSub no disponible' }] });
    const options = { ahora: new Date(), limite: 20, leaseMs: 30000 };
    const lotes = await Promise.all([worker.reclamarPendientes(options), worker.reclamarPendientes(options)]);
    expect(lotes.flat()).toHaveLength(1);
    expect(lotes.flat()[0]).toMatchObject({ eventId: evento.eventId, intentos: 3 });
    await expect(service.reintentar(evento.id)).rejects.toMatchObject({ status: 409 });
    await worker.marcarPublicado(lotes.flat()[0], 'mensaje-1', new Date());
    await expect(service.reintentar(evento.id)).rejects.toMatchObject({ status: 409 });
    expect((await service.listar({})).items[0]).toMatchObject({ estado: 'PUBLICADO', messageId: 'mensaje-1', ultimoError: null });
  });

  it('recupera lease vencido y descarta la confirmación del propietario anterior', async () => {
    const evento = await seed({ proximoIntentoEn: new Date(0) });
    const [viejo] = await worker.reclamarPendientes({ ahora: new Date(Date.now() - 60000), limite: 1, leaseMs: 1 });
    await service.reintentar(evento.id);
    await worker.marcarPublicado(viejo, 'confirmacion-obsoleta', new Date());
    expect((await service.listar({})).items[0]).toMatchObject({ estado: 'PENDIENTE', messageId: null });
  });

  it('coordina POST concurrente con el reclamo del worker sin duplicar el evento', async () => {
    const evento = await seed({ proximoIntentoEn: new Date(0) });
    const [retry, claim] = await Promise.allSettled([
      service.reintentar(evento.id),
      worker.reclamarPendientes({ ahora: new Date(), limite: 1, leaseMs: 30000 }),
    ]);
    if (retry.status === 'rejected') expect(retry.reason).toMatchObject({ status: 409 });
    expect(claim.status).toBe('fulfilled');
    const siguiente = await worker.reclamarPendientes({ ahora: new Date(), limite: 1, leaseMs: 30000 });
    const reclamados = claim.status === 'fulfilled' ? claim.value : [];
    expect([...reclamados, ...siguiente]).toHaveLength(1);
    expect((await service.listar({})).total).toBe(1);
  });

  it('recupera una publicación fallida con el mismo mensaje después del reintento administrativo', async () => {
    const eventId = randomUUID();
    const correlationId = randomUUID();
    const evento = await seed({ eventId, correlationId, proximoIntentoEn: new Date(0), payload: {
      eventId, correlationId, eventType: 'SolicitudMaterialAlmacen.v1',
      occurredAt: '2026-10-14T12:00:00.000Z', source: 'produccion-service',
      data: { solicitudId: '27', solicitudVersion: 1, ordenId: 15, ordenCodigo: 'ORD-0015',
        solicitanteUsuarioId: '42', fechaNecesaria: '2026-10-20', items: [{
          materialId: '8', materialCodigo: 'HAR-001', materialNombre: 'Harina',
          cantidad: '12.5000', unidad: 'kg',
        }] },
    } });
    const publishMessage = jest.fn().mockRejectedValueOnce(new Error('Pub/Sub no disponible'))
      .mockResolvedValue('mensaje-recuperado');
    const publisher = new PubSubPublisherService(
      { enabled: true, projectId: 'test', topicId: 'eventos' },
      { topic: () => ({ publishMessage }) } as any,
    );
    const publicador = new OutboxPublicadorService(worker, publisher, {
      enabled: false, batchSize: 10, pollIntervalMs: 5000, leaseMs: 30000,
      retryBaseMs: 60000, retryMaxMs: 60000,
    });
    await expect(publicador.procesarPendientes()).resolves.toMatchObject({ fallidos: 1, publicados: 0 });
    expect((await service.listar({})).items[0]).toMatchObject({ estado: 'PENDIENTE',
      eventId, correlationId, intentos: 1, ultimoError: 'Pub/Sub no disponible' });
    await service.reintentar(evento.id);
    await expect(publicador.procesarPendientes()).resolves.toMatchObject({ publicados: 1, fallidos: 0 });
    expect((await service.listar({})).items[0]).toMatchObject({ estado: 'PUBLICADO',
      eventId, correlationId, intentos: 2, messageId: 'mensaje-recuperado', ultimoError: null });
    expect(publishMessage.mock.calls[0][0]).toEqual(publishMessage.mock.calls[1][0]);
    await expect(publicador.procesarPendientes()).resolves.toMatchObject({ reclamados: 0 });
    expect(publishMessage).toHaveBeenCalledTimes(2);
  });
});
