import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../../database/data-source';
import { EventosOutbox1710000000017 } from '../../database/migrations/1710000000017-EventosOutbox';
import {
  ESTADO_OUTBOX_PENDIENTE,
  ESTADO_OUTBOX_PROCESANDO,
  ESTADO_OUTBOX_PUBLICADO,
  EventoOutbox,
} from './entities/evento-outbox.entity';
import { TypeOrmOutboxStore } from './typeorm-outbox.store';

describe('ABC-242: metadatos de persistencia outbox', () => {
  it('define identificadores únicos, JSONB y estado pendiente inicial', async () => {
    const source = new DataSource({ type: 'postgres', entities: [EventoOutbox] });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(EventoOutbox);

    expect(metadata.findColumnWithPropertyName('payload')?.type).toBe('jsonb');
    expect(metadata.findColumnWithPropertyName('estado')?.default).toBe(
      ESTADO_OUTBOX_PENDIENTE,
    );
    expect(metadata.indices.find((index) =>
      index.givenName === 'uq_eventos_outbox_event_id')?.isUnique).toBe(true);
    expect(metadata.indices.find((index) =>
      index.givenName === 'uq_eventos_outbox_agregado_evento')?.isUnique).toBe(true);
  });
});

const describeReal = process.env.OUTBOX_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-242: almacenamiento PostgreSQL y leases de outbox', () => {
  const schema = `abc242_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let store: TypeOrmOutboxStore;

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      migrations: [],
      entities: [EventoOutbox],
    });
    await source.initialize();
    await source.query(`CREATE SCHEMA "${schema}"`);
    const runner = source.createQueryRunner();
    try {
      await runner.query(`SET search_path TO "${schema}"`);
      await new EventosOutbox1710000000017().up(runner);
    } finally {
      await runner.release();
    }
    store = new TypeOrmOutboxStore(source);
  }, 30000);

  beforeEach(async () => {
    await source.query(`TRUNCATE "${schema}".eventos_outbox RESTART IDENTITY`);
  });

  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it('reclama una vez, recupera un lease vencido y conserva el eventId', async () => {
    const repository = source.getRepository(EventoOutbox);
    const eventId = 'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6';
    await repository.save(repository.create({
      eventId,
      correlationId: '81a265f2-15ec-430c-98e5-e1fa08bb7412',
      eventType: 'SolicitudMaterialAlmacen.v1',
      aggregateType: 'SolicitudMaterial',
      aggregateId: '27',
      payload: {
        eventId,
        eventType: 'SolicitudMaterialAlmacen.v1',
        occurredAt: '2026-10-11T18:15:00.000Z',
        source: 'produccion-service',
        correlationId: '81a265f2-15ec-430c-98e5-e1fa08bb7412',
        data: {},
      },
      proximoIntentoEn: new Date('2026-10-11T18:15:00.000Z'),
    }));
    const inicio = new Date('2026-10-11T18:15:00.000Z');
    const [primero] = await store.reclamarPendientes({
      ahora: inicio,
      limite: 1,
      leaseMs: 30000,
    });
    expect(primero).toMatchObject({
      eventId,
      estado: ESTADO_OUTBOX_PROCESANDO,
      intentos: 1,
    });
    await expect(store.reclamarPendientes({
      ahora: new Date('2026-10-11T18:15:29.999Z'),
      limite: 1,
      leaseMs: 30000,
    })).resolves.toHaveLength(0);
    const [recuperado] = await store.reclamarPendientes({
      ahora: new Date('2026-10-11T18:15:30.000Z'),
      limite: 1,
      leaseMs: 30000,
    });
    expect(recuperado).toMatchObject({ eventId, intentos: 2 });
    await store.marcarPublicado(
      recuperado,
      'mensaje-google-1',
      new Date('2026-10-11T18:15:31.000Z'),
    );
    await expect(repository.findOneByOrFail({ eventId })).resolves.toMatchObject({
      estado: ESTADO_OUTBOX_PUBLICADO,
      messageId: 'mensaje-google-1',
      intentos: 2,
    });
  });
});
