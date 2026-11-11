import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { AppDataSource } from '../database/data-source';
import { EventosOutboxLogistica1710000000011 } from '../database/migrations/1710000000011-EventosOutboxLogistica';
import { DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO } from './contratos/inventarios-salida-v1';
import { IntegracionesLogisticaController } from './integraciones.controller';
import { IntegracionesLogisticaService } from './integraciones.service';
import { EventoOutbox } from './outbox/entities/evento-outbox.entity';
import { OutboxPublicadorService } from './outbox/outbox-publicador.service';
import { OutboxStore } from './outbox/outbox.store';
import { loadPubSubLogisticaConfig } from './pubsub/pubsub-logistica.config';

describe('ABC-388: permisos del panel de integraciones de Logística', () => {
  it('consultar y reintentar exigen integraciones.reintentar', () => {
    expect(Reflect.getMetadata('__guards__', IntegracionesLogisticaController)).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, IntegracionesLogisticaController.prototype.listar)).toBe('integraciones.reintentar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, IntegracionesLogisticaController.prototype.reintentar)).toBe('integraciones.reintentar');
  });
});

// PostgreSQL real (como Docker). Se activa con LOGISTICA_DB_REAL=1 y usa un esquema temporal.
const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-388: pendientes y reintentos de Logística en PostgreSQL', () => {
  const schema = `abc388_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let creado = false;
  const config = loadPubSubLogisticaConfig({
    LOGISTICA_PUBSUB_ENABLED: 'true', GCP_PROJECT_ID: 'taller-local', LOGISTICA_PUBSUB_SALIDA_TOPIC_ID: 'taller-logistica-salida-local',
    OUTBOX_RETRY_BASE_MS: '60000', OUTBOX_RETRY_MAX_MS: '600000',
  });

  async function conectar() {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions), schema, migrations: [],
      extra: { options: `-c search_path=${schema}` },
    });
    await source.initialize();
  }

  beforeAll(async () => {
    await conectar();
    await source.query(`CREATE SCHEMA "${schema}"`);
    creado = true;
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new EventosOutboxLogistica1710000000011().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }, 30000);

  afterAll(async () => {
    if (!source?.isInitialized) return;
    try {
      if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await source.destroy();
    }
  });

  beforeEach(async () => {
    await source.query('DELETE FROM eventos_outbox');
  });

  let ruta = 0;
  async function evento() {
    const payload = { ...structuredClone(DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO), eventId: crypto.randomUUID() };
    return source.getRepository(EventoOutbox).save({
      eventId: payload.eventId, correlationId: payload.correlationId, eventType: payload.eventType,
      aggregateType: 'Ruta', aggregateId: String(++ruta), payload,
    });
  }
  const servicio = () => new IntegracionesLogisticaService(source, config);
  const caido = { publicar: async () => { throw new Error('UNAVAILABLE: Pub/Sub no responde'); } };

  it('un fallo de publicación es visible con intentos y último error, y sobrevive al reinicio', async () => {
    const creado = await evento();
    await new OutboxPublicadorService(new OutboxStore(source), caido as any, config).procesarPendientes();

    await source.destroy();
    await conectar();

    const { items, total } = await servicio().listar({ estado: 'PENDIENTE' });
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({
      id: creado.id, eventId: creado.eventId, estado: 'PENDIENTE', intentos: 1, puedeReintentar: true,
      agregado: { tipo: 'Ruta', id: creado.aggregateId }, destinoConfigurado: 'taller-logistica-salida-local',
    });
    expect(items[0].ultimoError).toContain('Pub/Sub no responde');
    expect(new Date(items[0].proximoIntentoEn).getTime()).toBeGreaterThan(Date.now() + 30000);
  });

  it('el reintento adelanta el MISMO evento y al publicarse no crea otro evento lógico', async () => {
    const creado = await evento();
    await new OutboxPublicadorService(new OutboxStore(source), caido as any, config).procesarPendientes();

    const { evento: reprogramado } = await servicio().reintentar(creado.id);
    expect(reprogramado).toMatchObject({ id: creado.id, eventId: creado.eventId, intentos: 1, estado: 'PENDIENTE' });
    expect(new Date(reprogramado.proximoIntentoEn).getTime()).toBeLessThanOrEqual(Date.now());

    const enviados: any[] = [];
    const ok = { publicar: async (e: any) => { enviados.push(e); return { messageId: 'msg-388', topicId: 't' }; } };
    await new OutboxPublicadorService(new OutboxStore(source), ok as any, config).procesarPendientes();

    const filas = await source.getRepository(EventoOutbox).find();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ estado: 'PUBLICADO', messageId: 'msg-388', eventId: creado.eventId, intentos: 2, ultimoError: null });
    expect(enviados).toEqual([creado.payload]);
  });

  it('no permite reintentar un evento publicado ni uno con lease vigente', async () => {
    const publicado = await evento();
    await source.query("UPDATE eventos_outbox SET estado = 'PUBLICADO', message_id = 'm' WHERE id = $1", [publicado.id]);
    await expect(servicio().reintentar(publicado.id)).rejects.toBeInstanceOf(ConflictException);

    const enCurso = await evento();
    await new OutboxStore(source).reclamarPendientes({ ahora: new Date(), limite: 10, leaseMs: 60000 });
    await expect(servicio().reintentar(enCurso.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('un lease vencido sí se puede reintentar', async () => {
    const vencido = await evento();
    await new OutboxStore(source).reclamarPendientes({ ahora: new Date(Date.now() - 120000), limite: 10, leaseMs: 1 });
    await expect(servicio().reintentar(vencido.id)).resolves.toMatchObject({ evento: { estado: 'PENDIENTE' } });
  });

  it('filtra por estado, pagina del más reciente al más antiguo y valida parámetros', async () => {
    for (let i = 0; i < 3; i += 1) await evento();
    const pagina = await servicio().listar({ page: '2', limit: '2' });
    expect(pagina).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(pagina.items).toHaveLength(1);
    await expect(servicio().listar({ estado: 'INVENTADO' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio().listar({ limit: '0' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio().reintentar('999999')).rejects.toBeInstanceOf(NotFoundException);
    await expect(servicio().reintentar('abc')).rejects.toBeInstanceOf(BadRequestException);
  });
});
