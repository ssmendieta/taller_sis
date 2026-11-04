import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { CierreProduccion } from '../../cierre-produccion/entities/cierre-produccion.entity';
import { AppDataSource } from '../../database/data-source';
import { ProduccionSchema1710000000002 } from '../../database/migrations/1710000000002-ProduccionSchema';
import { SolicitudesMaterial1710000000012 } from '../../database/migrations/1710000000012-SolicitudesMaterial';
import { EventosOutbox1710000000017 } from '../../database/migrations/1710000000017-EventosOutbox';
import { CierresProduccion1710000000018 } from '../../database/migrations/1710000000018-CierresProduccion';
import { EventosInbox1710000000019 } from '../../database/migrations/1710000000019-EventosInbox';
import { ResultadoContableCierre1710000000021 } from '../../database/migrations/1710000000021-ResultadoContableCierre';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';
import { REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO } from '../contratos/contabilidad-v1';
import { crearEventoProduccionCerrada } from '../outbox/crear-evento-produccion-cerrada';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { EventoInbox } from './entities/evento-inbox.entity';
import { ProcesadorResultadoContableService } from './procesador-resultado-contable.service';
import { PubSubContabilidadConsumerService } from './pubsub-contabilidad-consumer.service';

const describeReal = process.env.CONTABILIDAD_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-252: resultado contable atomico en PostgreSQL', () => {
  const schema = `abc252_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let processor: ProcesadorResultadoContableService;
  let secuencia = 0;

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      migrations: [],
      entities: [CierreProduccion, OrdenProduccion, EventoOutbox, EventoInbox],
    });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new ProduccionSchema1710000000002().up(runner);
      await new SolicitudesMaterial1710000000012().up(runner);
      await new EventosOutbox1710000000017().up(runner);
      await new CierresProduccion1710000000018().up(runner);
      await new EventosInbox1710000000019().up(runner);
      await new ResultadoContableCierre1710000000021().up(runner);
      await runner.query("INSERT INTO recetas (producto_codigo, producto_nombre) VALUES ('ABC252', 'Producto contable')");
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    processor = new ProcesadorResultadoContableService(source);
  }, 30000);

  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  async function escenario(estado: 'RECIBIDO' | 'RECHAZADO' = 'RECIBIDO') {
    const [orden] = await source.query(`INSERT INTO "${schema}".ordenes_produccion
      (codigo, receta_id, cantidad_solicitada, fecha_programada, responsable_usuario_id, estado, finalizada_en)
      VALUES ($1, 1, 10, CURRENT_DATE, 42, 'FINALIZADA', NOW()) RETURNING id::text AS id`,
    [`ORD-ABC252-${++secuencia}`]);
    const cierres = source.getRepository(CierreProduccion);
    const cierre = await cierres.save(cierres.create({
      ordenId: orden.id,
      cierreVersion: 1,
      ordenCodigo: `ORD-ABC252-${secuencia}`,
      producto: { productoId: 1, codigo: 'ABC252', nombre: 'Producto contable', unidad: 'unidad' },
      cantidadSolicitada: '10.0000',
      cantidadProducida: '10.0000',
      cantidadConforme: estado === 'RECHAZADO' ? '0.0000' : '10.0000',
      cantidadDefectuosa: estado === 'RECHAZADO' ? '10.0000' : '0.0000',
      consumos: [],
      finalizadaAt: new Date(),
    }));
    const salida = crearEventoProduccionCerrada(cierre);
    await source.getRepository(EventoOutbox).save({
      eventId: salida.eventId,
      correlationId: salida.correlationId,
      eventType: salida.eventType,
      aggregateType: 'CierreProduccion',
      aggregateId: cierre.id,
      payload: salida,
    });
    const respuesta = structuredClone(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO);
    respuesta.eventId = randomUUID();
    respuesta.correlationId = salida.correlationId;
    respuesta.data = {
      cierreId: cierre.id,
      cierreVersion: cierre.cierreVersion,
      ordenId: Number(cierre.ordenId),
      requestEventId: salida.eventId,
      estado,
      procesadoAt: new Date().toISOString(),
      ...(estado === 'RECHAZADO' ? { codigoRechazo: 'SIN_PRODUCCION_CONFORME', detalle: 'No hay unidades conformes' } : {}),
    };
    return { cierre, respuesta };
  }

  it('guarda RECIBIDO e inbox y una redelivery no altera estado ni historial', async () => {
    const { cierre, respuesta } = await escenario();
    await expect(processor.procesar(respuesta, 'mensaje-1')).resolves.toMatchObject({ resultado: 'PROCESADO' });
    const despues = await source.getRepository(CierreProduccion).findOneByOrFail({ id: cierre.id });
    expect(despues).toMatchObject({ estadoContable: 'RECIBIDO', resultadoContableEventId: respuesta.eventId });
    expect(await source.getRepository(EventoInbox).countBy({ eventId: respuesta.eventId })).toBe(1);

    await expect(processor.procesar(respuesta, 'redelivery-1')).resolves.toMatchObject({ resultado: 'DUPLICADO' });
    expect(await source.getRepository(CierreProduccion).findOneByOrFail({ id: cierre.id })).toMatchObject({
      estadoContable: 'RECIBIDO', resultadoContableEventId: respuesta.eventId,
    });
    expect(await source.getRepository(EventoInbox).countBy({ eventId: respuesta.eventId })).toBe(1);
  });

  it('persiste RECHAZADO como estado final e ignora un resultado tardio', async () => {
    const { cierre, respuesta } = await escenario('RECHAZADO');
    await expect(processor.procesar(respuesta, 'mensaje-rechazado')).resolves.toMatchObject({ resultado: 'PROCESADO' });
    const tardio = structuredClone(respuesta);
    tardio.eventId = randomUUID();
    tardio.data.estado = 'RECIBIDO';
    delete tardio.data.codigoRechazo;
    delete tardio.data.detalle;
    await expect(processor.procesar(tardio, 'mensaje-tardio')).resolves.toMatchObject({ resultado: 'IGNORADO' });
    expect(await source.getRepository(CierreProduccion).findOneByOrFail({ id: cierre.id })).toMatchObject({
      estadoContable: 'RECHAZADO', resultadoContableEventId: respuesta.eventId,
      codigoRechazoContable: 'SIN_PRODUCCION_CONFORME',
    });
    expect(await source.getRepository(EventoInbox).countBy({ correlationId: respuesta.correlationId })).toBe(2);
  });

  it('revierte todo para mensaje invalido o correlacion inexistente', async () => {
    const { cierre, respuesta } = await escenario();
    const invalido = structuredClone(respuesta) as any;
    invalido.data.estado = 'APROBADO';
    await expect(processor.procesar(invalido)).rejects.toThrow('data.estado');
    respuesta.data.requestEventId = randomUUID();
    await expect(processor.procesar(respuesta)).rejects.toThrow('No existe el evento');
    expect(await source.getRepository(CierreProduccion).findOneByOrFail({ id: cierre.id }))
      .toMatchObject({ estadoContable: 'PENDIENTE', resultadoContableEventId: null });
    expect(await source.getRepository(EventoInbox).countBy({ correlationId: respuesta.correlationId })).toBe(0);
  });

  it('reentrega si se interrumpe despues del commit y hace ACK sin doble efecto', async () => {
    const { cierre, respuesta } = await escenario();
    const consumer = new PubSubContabilidadConsumerService(
      processor,
      null,
      { enabled: false, projectId: 'taller-local', topicId: '', subscriptionId: '' },
    );
    const base = {
      id: 'mensaje-interrumpido',
      data: Buffer.from(JSON.stringify(respuesta)),
      attributes: {
        eventId: respuesta.eventId,
        eventType: respuesta.eventType,
        correlationId: respuesta.correlationId,
      },
      nack: jest.fn(),
    };
    const primera = {
      ...base,
      ack: jest.fn(() => { throw new Error('interrupcion antes de confirmar ACK'); }),
    };
    await (consumer as any).procesarMensaje(primera);
    expect(primera.nack).toHaveBeenCalledTimes(1);
    expect(await source.getRepository(CierreProduccion).findOneByOrFail({ id: cierre.id }))
      .toMatchObject({ estadoContable: 'RECIBIDO', resultadoContableEventId: respuesta.eventId });

    const redelivery = { ...base, id: 'mensaje-redelivery', ack: jest.fn(), nack: jest.fn() };
    await (consumer as any).procesarMensaje(redelivery);
    expect(redelivery.ack).toHaveBeenCalledTimes(1);
    expect(redelivery.nack).not.toHaveBeenCalled();
    expect(await source.getRepository(EventoInbox).countBy({ eventId: respuesta.eventId })).toBe(1);
    expect(await source.getRepository(CierreProduccion).findOneByOrFail({ id: cierre.id }))
      .toMatchObject({ estadoContable: 'RECIBIDO', resultadoContableEventId: respuesta.eventId });
  });
});
