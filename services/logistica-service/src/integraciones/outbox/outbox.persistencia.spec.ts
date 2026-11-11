import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../../database/data-source';
import { CrearSolicitudesSalida1710000000001 } from '../../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../../database/migrations/1710000000002-CrearBoletasEnvio';
import { ReglaConcurrenciaDocumental1710000000003 } from '../../database/migrations/1710000000003-ReglaConcurrenciaDocumental';
import { HistorialBoletasEnvio1710000000004 } from '../../database/migrations/1710000000004-HistorialBoletasEnvio';
import { CrearRutas1710000000005 } from '../../database/migrations/1710000000005-CrearRutas';
import { EstadosDespachoEntrega1710000000006 } from '../../database/migrations/1710000000006-EstadosDespachoEntrega';
import { ObservacionesDespachoEntrega1710000000008 } from '../../database/migrations/1710000000008-ObservacionesDespachoEntrega';
import { EventosOutboxLogistica1710000000011 } from '../../database/migrations/1710000000011-EventosOutboxLogistica';
import { ResultadoInventarioRuta1710000000012 } from '../../database/migrations/1710000000012-ResultadoInventarioRuta';
import { ProductoUnidadBoleta1710000000013 } from '../../database/migrations/1710000000013-ProductoUnidadBoleta';
import { DespachoService } from '../../despacho/despacho.service';
import { validarDespachoRutaRegistradoV1 } from '../contratos/inventarios-salida-v1.validator';
import { loadPubSubLogisticaConfig } from '../pubsub/pubsub-logistica.config';
import { EventoOutbox } from './entities/evento-outbox.entity';
import { OutboxEventosDespacho } from './outbox-eventos-despacho';
import { OutboxPublicadorService } from './outbox-publicador.service';
import { OutboxStore } from './outbox.store';

describe('ABC-386: configuración de Pub/Sub de Logística', () => {
  it('queda apagada por defecto y no se activa con las variables de Producción', () => {
    const config = loadPubSubLogisticaConfig({ PUBSUB_ENABLED: 'true', PUBSUB_TOPIC_ID: 'produccion' });
    expect(config.publicacion.enabled).toBe(false);
    expect(config.resultado.enabled).toBe(false);
  });

  it('exige proyecto y topic al activar la publicación', () => {
    expect(() => loadPubSubLogisticaConfig({ LOGISTICA_PUBSUB_ENABLED: 'true' })).toThrow('GCP_PROJECT_ID');
    expect(() => loadPubSubLogisticaConfig({ LOGISTICA_PUBSUB_ENABLED: 'true', GCP_PROJECT_ID: 'p' })).toThrow('LOGISTICA_PUBSUB_SALIDA_TOPIC_ID');
    expect(loadPubSubLogisticaConfig({
      LOGISTICA_PUBSUB_ENABLED: 'true', GCP_PROJECT_ID: 'p', LOGISTICA_PUBSUB_SALIDA_TOPIC_ID: 'projects/p/topics/salida',
    }).publicacion).toEqual({ enabled: true, topicId: 'salida', timeoutMs: 10000 });
  });
});

// PostgreSQL real (como Docker). Se activa con LOGISTICA_DB_REAL=1 y usa un esquema temporal.
const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-386: despacho con outbox y publicación confiable en PostgreSQL', () => {
  const schema = `abc386_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let creado = false;
  let despacho: DespachoService;
  let store: OutboxStore;
  let numero = 0;
  const config = loadPubSubLogisticaConfig({
    LOGISTICA_PUBSUB_ENABLED: 'true', GCP_PROJECT_ID: 'taller-local', LOGISTICA_PUBSUB_SALIDA_TOPIC_ID: 'salida',
    OUTBOX_RETRY_BASE_MS: '1000', OUTBOX_RETRY_MAX_MS: '60000',
  });

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions), schema, migrations: [],
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
        new CrearSolicitudesSalida1710000000001(), new CrearBoletasEnvio1710000000002(),
        new ReglaConcurrenciaDocumental1710000000003(), new HistorialBoletasEnvio1710000000004(),
        new CrearRutas1710000000005(), new EstadosDespachoEntrega1710000000006(),
        new ObservacionesDespachoEntrega1710000000008(), new EventosOutboxLogistica1710000000011(),
        new ResultadoInventarioRuta1710000000012(), new ProductoUnidadBoleta1710000000013(),
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
    despacho = new DespachoService(source, new OutboxEventosDespacho());
    store = new OutboxStore(source);
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

  async function rutaConBoleta(items: Array<[string, string]> = [['LOT-GAL-001', '6'], ['LOT-GAL-002', '2.5']]) {
    const [solicitud] = await source.query(
      `INSERT INTO solicitudes_salida (orden_id, destino_documental, motivo, responsable_usuario_id)
       VALUES (2, 'Tienda', 'Envío', 4) RETURNING id::text AS id`);
    const [boleta] = await source.query(
      `INSERT INTO boletas_envio
         (solicitud_salida_id, numero, estado, responsable_usuario_id, producto_codigo, unidad)
       VALUES ($1, $2, 'EMITIDA', 4, 'GAL-001', 'unidad') RETURNING id::text AS id`,
      [solicitud.id, `BOL-386-${++numero}`]);
    for (const [referencia, cantidad] of items) {
      await source.query('INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad) VALUES ($1, $2, $3)', [boleta.id, referencia, cantidad]);
    }
    const [ruta] = await source.query(
      `INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, responsable_usuario_id)
       VALUES ('2026-11-12', 'VEH-01', 'CHO-07', 4) RETURNING id::text AS id`);
    const [parada] = await source.query(
      `INSERT INTO rutas_paradas (ruta_id, secuencia, destino) VALUES ($1, 1, 'Tienda') RETURNING id::text AS id`, [ruta.id]);
    await source.query('INSERT INTO rutas_paradas_boletas (parada_id, boleta_id) VALUES ($1, $2)', [parada.id, boleta.id]);
    return { rutaId: ruta.id as string, boletaId: boleta.id as string };
  }

  const eventos = () => source.getRepository(EventoOutbox).find({ order: { id: 'ASC' } });
  const estadoRuta = async (id: string) => (await source.query('SELECT estado FROM rutas WHERE id = $1', [id]))[0].estado;

  it('el despacho y su evento DespachoRutaRegistrado.v1 se confirman en el mismo commit', async () => {
    const { rutaId, boletaId } = await rutaConBoleta();
    await despacho.despachar(rutaId, '4', 'Sale a las 8');
    const [evento] = await eventos();
    expect(await estadoRuta(rutaId)).toBe('DESPACHADA');
    expect(evento).toMatchObject({ estado: 'PENDIENTE', aggregateType: 'Ruta', aggregateId: rutaId, intentos: 0, messageId: null });
    const payload = validarDespachoRutaRegistradoV1(evento.payload);
    expect(payload.data).toMatchObject({
      rutaId, fechaProgramada: '2026-11-12', despachadaPorUsuarioId: '4', vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-07',
      boletas: [{ boletaId, ordenId: '2', productoCodigo: 'GAL-001', unidad: 'unidad', items: [
        { loteReferencia: 'LOT-GAL-001', cantidad: '6.0000' }, { loteReferencia: 'LOT-GAL-002', cantidad: '2.5000' },
      ] }],
    });
    expect(payload.eventId).toBe(evento.eventId);
  });

  it('si el despacho se revierte no queda evento (rollback no publica)', async () => {
    const { rutaId } = await rutaConBoleta();
    await source.query("UPDATE boletas_envio SET estado = 'ANULADA' WHERE id IN (SELECT boleta_id FROM rutas_paradas_boletas)");
    await expect(despacho.despachar(rutaId, '4', null)).rejects.toThrow('EMITIDAS');
    expect(await estadoRuta(rutaId)).toBe('PLANIFICADA');
    expect(await eventos()).toEqual([]);
  });

  it('si el evento no se puede guardar se revierte también el despacho', async () => {
    const { rutaId } = await rutaConBoleta();
    const fallo = new DespachoService(source, { registrarDespacho: async () => { throw new Error('outbox no disponible'); } });
    await expect(fallo.despachar(rutaId, '4', null)).rejects.toThrow('outbox no disponible');
    expect(await estadoRuta(rutaId)).toBe('PLANIFICADA');
  });

  it('un mismo despacho genera un solo evento lógico aunque se reintente', async () => {
    const { rutaId } = await rutaConBoleta();
    await despacho.despachar(rutaId, '4', null);
    await expect(despacho.despachar(rutaId, '4', null)).rejects.toThrow();
    expect(await eventos()).toHaveLength(1);
  });

  it('con el broker caído conserva el evento PENDIENTE con su error y al volver publica el mismo eventId y cuerpo', async () => {
    const { rutaId } = await rutaConBoleta();
    await despacho.despachar(rutaId, '4', null);
    const [original] = await eventos();
    let caido = true;
    const publicados: unknown[] = [];
    const publisher = {
      publicar: async (evento: unknown) => {
        if (caido) throw new Error('UNAVAILABLE: broker caído');
        publicados.push(evento);
        return { messageId: 'msg-386-1', topicId: 'salida' };
      },
    };
    const publicador = new OutboxPublicadorService(store, publisher as any, config);

    // El reloj de PostgreSQL (Docker) puede ir unos ms adelantado: se reclama con un margen.
    const ahora = new Date(Date.now() + 1000);
    expect(await publicador.procesarPendientes(ahora)).toMatchObject({ reclamados: 1, publicados: 0, fallidos: 1 });
    const [pendiente] = await eventos();
    expect(pendiente).toMatchObject({ estado: 'PENDIENTE', intentos: 1, messageId: null });
    expect(pendiente.ultimoError).toContain('broker caído');
    expect(pendiente.proximoIntentoEn.getTime()).toBeGreaterThan(Date.now());

    // Mientras dura la espera no se reintenta.
    expect((await publicador.procesarPendientes(ahora)).reclamados).toBe(0);

    caido = false;
    const despues = new Date(pendiente.proximoIntentoEn.getTime() + 1);
    expect(await publicador.procesarPendientes(despues)).toMatchObject({ reclamados: 1, publicados: 1 });
    const [publicado] = await eventos();
    expect(publicado).toMatchObject({ estado: 'PUBLICADO', intentos: 2, messageId: 'msg-386-1', ultimoError: null, eventId: original.eventId });
    expect(publicados).toEqual([original.payload]);
  });

  it('dos workers simultáneos no reclaman el mismo evento', async () => {
    for (let i = 0; i < 4; i += 1) {
      const { rutaId } = await rutaConBoleta();
      await despacho.despachar(rutaId, '4', null);
    }
    const ahora = new Date(Date.now() + 1000);
    const [a, b] = await Promise.all([
      store.reclamarPendientes({ ahora, limite: 3, leaseMs: 30000 }),
      store.reclamarPendientes({ ahora, limite: 3, leaseMs: 30000 }),
    ]);
    const ids = [...a, ...b].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(4);
  });

  it('un resultado tardío de un lease vencido no pisa al nuevo propietario', async () => {
    const { rutaId } = await rutaConBoleta();
    await despacho.despachar(rutaId, '4', null);
    const [viejo] = await store.reclamarPendientes({ ahora: new Date(Date.now() + 1000), limite: 1, leaseMs: 1 });
    const [nuevo] = await store.reclamarPendientes({ ahora: new Date(Date.now() + 2000), limite: 1, leaseMs: 30000 });
    expect(nuevo.id).toBe(viejo.id);
    expect(await store.marcarPublicado(viejo, 'msg-viejo', new Date())).toBe(false);
    expect(await store.marcarPublicado(nuevo, 'msg-nuevo', new Date())).toBe(true);
    const [evento] = await eventos();
    expect(evento.messageId).toBe('msg-nuevo');
  });
});
