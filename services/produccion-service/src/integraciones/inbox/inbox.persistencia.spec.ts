import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../../database/data-source';
import { ProduccionSchema1710000000002 } from '../../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { SolicitudesMaterial1710000000012 } from '../../database/migrations/1710000000012-SolicitudesMaterial';
import { EventosOutbox1710000000017 } from '../../database/migrations/1710000000017-EventosOutbox';
import { EventosInbox1710000000019 } from '../../database/migrations/1710000000019-EventosInbox';
import { Material } from '../../materiales/entities/material.entity';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';
import { SolicitudMaterial } from '../../solicitudes-material/entities/solicitud-material.entity';
import { SolicitudMaterialItem } from '../../solicitudes-material/entities/solicitud-material-item.entity';
import {
  SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO,
  SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
} from '../contratos/inventario-almacen-v1';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { EventoInbox } from './entities/evento-inbox.entity';
import { ProcesadorRespuestaInventarioService } from './procesador-respuesta-inventario.service';

describe('ABC-244: metadatos del inbox', () => {
  it('define eventId unico, hash y payload JSONB', async () => {
    const source = new DataSource({ type: 'postgres', entities: [EventoInbox] });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(EventoInbox);
    expect(metadata.findColumnWithPropertyName('payload')?.type).toBe('jsonb');
    expect(metadata.findColumnWithPropertyName('payloadHash')?.length).toBe('64');
    expect(metadata.indices.find((index) => index.givenName === 'uq_eventos_inbox_event_id')?.isUnique)
      .toBe(true);
  });
});

const describeReal = process.env.INBOX_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-244: inbox y solicitud en PostgreSQL', () => {
  const schema = `abc244_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let processor: ProcesadorRespuestaInventarioService;
  let solicitudId: string;
  let ordenId: number;
  let solicitud: typeof SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO;
  let respuesta: typeof SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO;

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      migrations: [],
      entities: [
        EventoInbox, EventoOutbox, SolicitudMaterial, SolicitudMaterialItem,
        OrdenProduccion, Material,
      ],
    });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new ProduccionSchema1710000000002().up(runner);
      await new OrdenesCodigoSecuencia1710000000007().up(runner);
      await new SolicitudesMaterial1710000000012().up(runner);
      await new EventosOutbox1710000000017().up(runner);
      await new EventosInbox1710000000019().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    processor = new ProcesadorRespuestaInventarioService(source);
  }, 30000);

  beforeEach(async () => {
    await source.query(`TRUNCATE "${schema}".eventos_inbox, "${schema}".eventos_outbox,
      "${schema}".solicitud_material_items, "${schema}".solicitudes_material,
      "${schema}".ordenes_produccion, "${schema}".recetas RESTART IDENTITY CASCADE`);
    await source.query(`INSERT INTO "${schema}".recetas (producto_codigo, producto_nombre)
      VALUES ('ABC244', 'Producto ABC-244')`);
    const [orden] = await source.query(`INSERT INTO "${schema}".ordenes_produccion
      (codigo, receta_id, cantidad_solicitada, fecha_programada, responsable_usuario_id)
      VALUES ('ORD-ABC244', 1, 10, CURRENT_DATE, 42) RETURNING id`);
    ordenId = Number(orden.id);
    const [creada] = await source.query(`INSERT INTO "${schema}".solicitudes_material
      (orden_id, solicitante_usuario_id) VALUES ($1, 42) RETURNING id::text AS id`, [ordenId]);
    solicitudId = creada.id;
    solicitud = structuredClone(SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO);
    solicitud.data.solicitudId = solicitudId;
    solicitud.data.ordenId = ordenId;
    solicitud.data.ordenCodigo = 'ORD-ABC244';
    respuesta = structuredClone(SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO);
    respuesta.correlationId = solicitud.correlationId;
    respuesta.data.requestEventId = solicitud.eventId;
    respuesta.data.solicitudId = solicitudId;
    respuesta.data.ordenId = ordenId;
    await source.getRepository(EventoOutbox).save({
      eventId: solicitud.eventId,
      correlationId: solicitud.correlationId,
      eventType: solicitud.eventType,
      aggregateType: 'SolicitudMaterial',
      aggregateId: solicitudId,
      payload: solicitud,
    });
  });

  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it('confirma una vez el cambio y trata la redelivery como duplicado', async () => {
    await expect(processor.procesar(respuesta, 'mensaje-real-1'))
      .resolves.toMatchObject({ resultado: 'PROCESADO' });
    await expect(processor.procesar(respuesta, 'mensaje-real-1'))
      .resolves.toMatchObject({ resultado: 'DUPLICADO' });

    await expect(source.getRepository(SolicitudMaterial).findOneByOrFail({ id: solicitudId }))
      .resolves.toMatchObject({ estado: 'APROBADA', solicitudVersion: 2 });
    expect(await source.getRepository(EventoInbox).countBy({ eventId: respuesta.eventId })).toBe(1);
  });

  it('revierte todo cuando la respuesta no correlaciona', async () => {
    respuesta.correlationId = '8a63816a-4375-42ff-ac9f-3b606188e76e';
    await expect(processor.procesar(respuesta)).rejects.toThrow('correlationId');
    await expect(source.getRepository(SolicitudMaterial).findOneByOrFail({ id: solicitudId }))
      .resolves.toMatchObject({ estado: 'PENDIENTE', solicitudVersion: 1 });
    expect(await source.getRepository(EventoInbox).count()).toBe(0);
  });
});
