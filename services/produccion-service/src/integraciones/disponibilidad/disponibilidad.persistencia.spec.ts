import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../../database/data-source';
import { ProduccionSchema1710000000002 } from '../../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { SolicitudesMaterial1710000000012 } from '../../database/migrations/1710000000012-SolicitudesMaterial';
import { EventosOutbox1710000000017 } from '../../database/migrations/1710000000017-EventosOutbox';
import { EventosInbox1710000000019 } from '../../database/migrations/1710000000019-EventosInbox';
import { ConsultasDisponibilidad1710000000020 } from '../../database/migrations/1710000000020-ConsultasDisponibilidad';
import { EventoInbox } from '../inbox/entities/evento-inbox.entity';
import { ProcesadorRespuestaInventarioService } from '../inbox/procesador-respuesta-inventario.service';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';
import { OrdenesService } from '../../ordenes/ordenes.service';
import { DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO } from '../contratos/inventario-almacen-v1';
import { ConsultaDisponibilidad } from './entities/consulta-disponibilidad.entity';
import { ConsultaDisponibilidadItem } from './entities/consulta-disponibilidad-item.entity';

describe('ABC-278: metadatos de disponibilidad', () => {
  it('define versiones, eventos e items unicos', async () => {
    const source = new DataSource({
      type: 'postgres',
      entities: [ConsultaDisponibilidad, ConsultaDisponibilidadItem],
    });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const consulta = source.getMetadata(ConsultaDisponibilidad);
    const item = source.getMetadata(ConsultaDisponibilidadItem);

    expect(consulta.indices.find((index) =>
      index.givenName === 'uq_consultas_disponibilidad_orden_version')?.isUnique).toBe(true);
    expect(consulta.indices.find((index) =>
      index.givenName === 'uq_consultas_disponibilidad_request_event_id')?.isUnique).toBe(true);
    expect(item.indices.find((index) =>
      index.givenName === 'uq_consulta_disponibilidad_item_material')?.isUnique).toBe(true);
  });
});

const describeReal = process.env.DISPONIBILIDAD_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-278: migracion de disponibilidad en PostgreSQL', () => {
  const schema = `abc278_test_${process.pid}_${Date.now()}`;
  let source: DataSource;

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      migrations: [],
      entities: [
        OrdenProduccion,
        ConsultaDisponibilidad,
        ConsultaDisponibilidadItem,
        EventoOutbox,
        EventoInbox,
      ],
    });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET search_path TO "${schema}"`);
    await new ProduccionSchema1710000000002().up(runner);
    await new OrdenesCodigoSecuencia1710000000007().up(runner);
    await new SolicitudesMaterial1710000000012().up(runner);
    await new EventosOutbox1710000000017().up(runner);
    await new EventosInbox1710000000019().up(runner);
    await new ConsultasDisponibilidad1710000000020().up(runner);
    await runner.release();
  }, 30000);

  afterAll(async () => {
    if (source?.isInitialized) {
      await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      await source.destroy();
    }
  });

  it('persiste pendiente y luego aplica un snapshot completo', async () => {
    const [material] = await source.query(`INSERT INTO "${schema}".materiales
      (codigo, nombre, unidad_medida) VALUES ('HAR-001', 'Harina', 'kg') RETURNING id`);
    const [receta] = await source.query(`INSERT INTO "${schema}".recetas
      (producto_codigo, producto_nombre) VALUES ('PAN-001', 'Pan') RETURNING id`);
    const [orden] = await source.query(`INSERT INTO "${schema}".ordenes_produccion
      (codigo, receta_id, cantidad_solicitada, fecha_programada, responsable_usuario_id)
      VALUES ('ORD-ABC278', $1, 10, CURRENT_DATE, 42) RETURNING id`, [receta.id]);
    const requestEventId = randomUUID();
    const [consulta] = await source.query(`INSERT INTO "${schema}".consultas_disponibilidad
      (consulta_id, consulta_version, orden_id, request_event_id, correlation_id)
      VALUES ('DISP-ORD-ABC278-V1', 1, $1, $2, $3) RETURNING id`,
    [orden.id, requestEventId, randomUUID()]);
    await source.query(`INSERT INTO "${schema}".consulta_disponibilidad_items
      (consulta_disponibilidad_id, material_id, material_codigo, material_nombre,
       cantidad_requerida, unidad)
      VALUES ($1, $2, 'HAR-001', 'Harina', 12.5, 'kg')`, [consulta.id, material.id]);

    const responseEventId = randomUUID();
    await source.transaction(async (manager) => {
      await manager.query(`UPDATE "${schema}".consulta_disponibilidad_items
        SET cantidad_disponible = 20, estado = 'SUFICIENTE'
        WHERE consulta_disponibilidad_id = $1`, [consulta.id]);
      await manager.query(`UPDATE "${schema}".consultas_disponibilidad
        SET estado = 'RESPONDIDA', response_event_id = $2, vigente_en = NOW()
        WHERE id = $1`, [consulta.id, responseEventId]);
    });

    const [guardada] = await source.query(`SELECT c.estado, c.response_event_id,
      i.cantidad_disponible::text, i.estado AS estado_material
      FROM "${schema}".consultas_disponibilidad c
      JOIN "${schema}".consulta_disponibilidad_items i
        ON i.consulta_disponibilidad_id = c.id
      WHERE c.id = $1`, [consulta.id]);
    expect(guardada).toMatchObject({
      estado: 'RESPONDIDA', response_event_id: responseEventId,
      cantidad_disponible: '20.0000', estado_material: 'SUFICIENTE',
    });
  });

  it('ejecuta solicitud, outbox, respuesta e inbox con servicios reales', async () => {
    const [material] = await source.query(`INSERT INTO "${schema}".materiales
      (codigo, nombre, unidad_medida) VALUES ('AZU-278', 'Azucar', 'kg') RETURNING id`);
    const [receta] = await source.query(`INSERT INTO "${schema}".recetas
      (producto_codigo, producto_nombre) VALUES ('PAN-278', 'Pan ABC-278') RETURNING id`);
    await source.query(`INSERT INTO "${schema}".receta_material
      (receta_id, material_id, cantidad_requerida) VALUES ($1, $2, 2)`,
    [receta.id, material.id]);
    const [orden] = await source.query(`INSERT INTO "${schema}".ordenes_produccion
      (codigo, receta_id, cantidad_solicitada, fecha_programada, responsable_usuario_id)
      VALUES ('ORD-FLUJO-278', $1, 10, CURRENT_DATE, 42) RETURNING id`, [receta.id]);
    const ordenes = new OrdenesService(
      source.getRepository(OrdenProduccion),
      {} as any,
      {} as any,
      { findOne: async () => ({ activa: true, unidad_producto: 'unidad' }) } as any,
    );

    const pendiente = await ordenes.solicitarDisponibilidadMateriales(Number(orden.id));
    const repetida = await ordenes.solicitarDisponibilidadMateriales(Number(orden.id));
    expect(repetida.consulta_id).toBe(pendiente.consulta_id);
    const [eventoOutbox] = await source.query(`SELECT * FROM "${schema}".eventos_outbox
      WHERE event_type = 'DisponibilidadMaterialSolicitada.v1' AND aggregate_id = $1`,
    [String((await source.query(`SELECT id FROM "${schema}".consultas_disponibilidad
      WHERE orden_id = $1`, [orden.id]))[0].id)]);
    expect(eventoOutbox).toBeDefined();

    const solicitud = eventoOutbox.payload;
    const respuesta = structuredClone(DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO);
    respuesta.eventId = randomUUID();
    respuesta.correlationId = solicitud.correlationId;
    respuesta.data.consultaId = solicitud.data.consultaId;
    respuesta.data.consultaVersion = solicitud.data.consultaVersion;
    respuesta.data.requestEventId = solicitud.eventId;
    respuesta.data.ordenId = solicitud.data.ordenId;
    respuesta.data.materiales = solicitud.data.materiales.map((item: Record<string, string>) => ({
      ...item, cantidadDisponible: item.cantidadRequerida, estado: 'SUFICIENTE' as const,
    }));
    const processor = new ProcesadorRespuestaInventarioService(source);
    await expect(processor.procesar(respuesta, 'mensaje-real-278')).resolves.toMatchObject({
      resultado: 'PROCESADO', consultaId: solicitud.data.consultaId,
    });
    await expect(processor.procesar(respuesta, 'mensaje-real-278')).resolves.toMatchObject({
      resultado: 'DUPLICADO',
    });

    const snapshot = await ordenes.compararDisponibilidadMateriales(Number(orden.id));
    expect(snapshot).toMatchObject({
      estado_consulta: 'RESPONDIDA',
      materiales: [expect.objectContaining({
        material_id: Number(material.id), cantidad_requerida: 20,
        cantidad_disponible: 20, estado: 'SUFICIENTE',
      })],
    });
    const [conteos] = await source.query(`SELECT
      (SELECT COUNT(*)::int FROM "${schema}".consultas_disponibilidad WHERE orden_id = $1) AS consultas,
      (SELECT COUNT(*)::int FROM "${schema}".eventos_outbox WHERE aggregate_type = 'ConsultaDisponibilidad') AS outbox,
      (SELECT COUNT(*)::int FROM "${schema}".eventos_inbox WHERE event_id = $2) AS inbox`,
    [orden.id, respuesta.eventId]);
    expect(conteos).toEqual({ consultas: 1, outbox: 1, inbox: 1 });
  });
});
