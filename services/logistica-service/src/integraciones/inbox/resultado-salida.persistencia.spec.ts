import 'reflect-metadata';
import { randomUUID } from 'crypto';
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
import { DespachoService } from '../../despacho/despacho.service';
import { SALIDA_INVENTARIO_RESULTADO_V1, DespachoRutaRegistradoV1Event } from '../contratos/inventarios-salida-v1';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { OutboxEventosDespacho } from '../outbox/outbox-eventos-despacho';
import { ProcesadorResultadoSalidaService } from './procesador-resultado-salida.service';
import { PubSubResultadoSalidaConsumer } from './pubsub-resultado-salida.consumer';

// ABC-387: respuesta de Inventarios con PostgreSQL real. Se activa con LOGISTICA_DB_REAL=1.
const describeReal = process.env.LOGISTICA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-387: resultado de Inventarios aplicado a la ruta en PostgreSQL', () => {
  const schema = `abc387_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let creado = false;
  let despacho: DespachoService;
  let processor: ProcesadorResultadoSalidaService;
  let consumer: PubSubResultadoSalidaConsumer;
  let numero = 0;

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
        new ResultadoInventarioRuta1710000000012(),
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
    processor = new ProcesadorResultadoSalidaService(source);
    consumer = new PubSubResultadoSalidaConsumer(processor, null, {
      projectId: 'taller-local', publicacion: { enabled: false, topicId: '', timeoutMs: 1 }, resultado: { enabled: false, subscriptionId: '' },
      outbox: { batchSize: 1, pollIntervalMs: 1, leaseMs: 1, retryBaseMs: 1, retryMaxMs: 1 },
    });
  }, 30000);

  afterAll(async () => {
    if (!source?.isInitialized) return;
    try {
      if (creado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await source.destroy();
    }
  });

  async function rutaDespachada() {
    const [solicitud] = await source.query(
      `INSERT INTO solicitudes_salida (orden_id, destino_documental, motivo, responsable_usuario_id)
       VALUES (2, 'Tienda', 'Envío', 4) RETURNING id::text AS id`);
    const [boleta] = await source.query(
      `INSERT INTO boletas_envio (solicitud_salida_id, numero, estado, responsable_usuario_id)
       VALUES ($1, $2, 'EMITIDA', 4) RETURNING id::text AS id`, [solicitud.id, `BOL-387-${++numero}`]);
    await source.query("INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad) VALUES ($1, 'LOT-A', 6)", [boleta.id]);
    const [ruta] = await source.query(
      `INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, responsable_usuario_id)
       VALUES ('2026-11-12', 'VEH-01', 'CHO-07', 4) RETURNING id::text AS id`);
    const [parada] = await source.query(
      "INSERT INTO rutas_paradas (ruta_id, secuencia, destino) VALUES ($1, 1, 'Tienda') RETURNING id::text AS id", [ruta.id]);
    await source.query('INSERT INTO rutas_paradas_boletas (parada_id, boleta_id) VALUES ($1, $2)', [parada.id, boleta.id]);
    await despacho.despachar(ruta.id, '4', null);
    const evento = await source.getRepository(EventoOutbox).findOneByOrFail({ aggregateId: ruta.id });
    return { rutaId: ruta.id as string, enviado: evento.payload as DespachoRutaRegistradoV1Event };
  }

  function respuesta(enviado: DespachoRutaRegistradoV1Event, cambios: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
    return {
      eventId: randomUUID(), eventType: SALIDA_INVENTARIO_RESULTADO_V1, occurredAt: new Date().toISOString(),
      source: 'inventarios-service', correlationId: enviado.correlationId, ...cambios,
      data: { rutaId: enviado.data.rutaId, requestEventId: enviado.eventId, estado: 'ACEPTADA', procesadoAt: new Date().toISOString(), ...data },
    };
  }
  const mensaje = (payload: unknown) => ({
    id: `msg-${randomUUID()}`, data: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)), ack: jest.fn(), nack: jest.fn(),
  });
  const ruta = async (id: string) => (await source.query(
    `SELECT estado, inventario_estado, inventario_resultado_event_id::text AS evento, inventario_codigo_rechazo AS codigo, inventario_detalle AS detalle
       FROM rutas WHERE id = $1`, [id]))[0];
  const inbox = async (eventId: string) => source.query('SELECT estado, message_id FROM eventos_inbox WHERE event_id = $1', [eventId]);

  it('ACEPTADA: actualiza la ruta e inbox en el mismo commit y luego hace ACK; el tránsito no cambia', async () => {
    const { rutaId, enviado } = await rutaDespachada();
    const r = respuesta(enviado);
    const m = mensaje(r);
    await consumer.procesarMensaje(m);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(await ruta(rutaId)).toMatchObject({ estado: 'DESPACHADA', inventario_estado: 'ACEPTADA', evento: r.eventId, codigo: null });
    expect(await inbox(r.eventId)).toEqual([{ estado: 'PROCESADO', message_id: m.id }]);
  });

  it('RECHAZADA: guarda código y detalle del rechazo', async () => {
    const { rutaId, enviado } = await rutaDespachada();
    await processor.procesar(respuesta(enviado, {}, { estado: 'RECHAZADA', codigoRechazo: 'LOTE_SIN_STOCK', detalle: 'Sin existencias de LOT-A' }));
    expect(await ruta(rutaId)).toMatchObject({ inventario_estado: 'RECHAZADA', codigo: 'LOTE_SIN_STOCK', detalle: 'Sin existencias de LOT-A' });
  });

  it('duplicado: la redelivery del mismo eventId responde DUPLICADO sin escribir de nuevo', async () => {
    const { enviado } = await rutaDespachada();
    const r = respuesta(enviado);
    await processor.procesar(r, 'm1');
    await expect(processor.procesar(r, 'm2')).resolves.toMatchObject({ resultado: 'DUPLICADO' });
    expect(await inbox(r.eventId)).toEqual([{ estado: 'PROCESADO', message_id: 'm1' }]);
  });

  it('mismo eventId con contenido contradictorio: rechazo permanente con ACK y sin cambios', async () => {
    const { rutaId, enviado } = await rutaDespachada();
    const r = respuesta(enviado);
    await processor.procesar(r);
    const contradictorio = { ...r, data: { ...r.data, estado: 'RECHAZADA', codigoRechazo: 'X' } };
    const m = mensaje(contradictorio);
    await consumer.procesarMensaje(m);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(await ruta(rutaId)).toMatchObject({ inventario_estado: 'ACEPTADA' });
  });

  it.each([
    ['requestEventId inexistente', (e: DespachoRutaRegistradoV1Event) => respuesta(e, {}, { requestEventId: randomUUID() })],
    ['otra ruta', (e: DespachoRutaRegistradoV1Event) => respuesta(e, {}, { rutaId: '999999' })],
    ['otro correlationId', (e: DespachoRutaRegistradoV1Event) => respuesta(e, { correlationId: randomUUID() })],
  ])('correlación inválida (%s): ACK sin modificar ninguna ruta', async (_caso, crear) => {
    const { rutaId, enviado } = await rutaDespachada();
    const r = crear(enviado);
    const m = mensaje(r);
    await consumer.procesarMensaje(m);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.nack).not.toHaveBeenCalled();
    expect(await ruta(rutaId)).toMatchObject({ inventario_estado: null });
    expect(await inbox(r.eventId)).toEqual([]);
  });

  it('una segunda respuesta posterior queda IGNORADA y conserva el primer resultado', async () => {
    const { rutaId, enviado } = await rutaDespachada();
    const primera = respuesta(enviado);
    await processor.procesar(primera);
    const tardia = respuesta(enviado, {}, { estado: 'RECHAZADA', codigoRechazo: 'TARDIO' });
    await expect(processor.procesar(tardia)).resolves.toMatchObject({ resultado: 'IGNORADO' });
    expect(await ruta(rutaId)).toMatchObject({ inventario_estado: 'ACEPTADA', evento: primera.eventId });
    expect((await inbox(tardia.eventId))[0].estado).toBe('IGNORADO');
  });

  it('dos entregas simultáneas del mismo mensaje dejan un solo efecto', async () => {
    const { enviado } = await rutaDespachada();
    const r = respuesta(enviado);
    const resultados = await Promise.all([processor.procesar(r, 'a'), processor.procesar(r, 'b')]);
    expect(resultados.map((x) => x.resultado).sort()).toEqual(['DUPLICADO', 'PROCESADO']);
    expect(await inbox(r.eventId)).toHaveLength(1);
  });

  it('ACK perdido tras el commit: NACK y la redelivery confirma sin doble efecto', async () => {
    const { rutaId, enviado } = await rutaDespachada();
    const r = respuesta(enviado);
    const interrumpido = { ...mensaje(r), ack: jest.fn(() => { throw new Error('conexión perdida'); }) };
    await consumer.procesarMensaje(interrumpido);
    expect(interrumpido.nack).toHaveBeenCalledTimes(1);
    expect(await ruta(rutaId)).toMatchObject({ inventario_estado: 'ACEPTADA' });
    const redelivery = mensaje(r);
    await consumer.procesarMensaje(redelivery);
    expect(redelivery.ack).toHaveBeenCalledTimes(1);
    expect(await inbox(r.eventId)).toHaveLength(1);
  });

  it('mensaje inválido o no JSON: ACK sin bucle', async () => {
    for (const payload of ['{no json', { eventType: SALIDA_INVENTARIO_RESULTADO_V1 }]) {
      const m = mensaje(payload);
      await consumer.procesarMensaje(m);
      expect(m.ack).toHaveBeenCalledTimes(1);
      expect(m.nack).not.toHaveBeenCalled();
    }
  });
});
