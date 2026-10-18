import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DeepPartial } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { UnidadesMedida1710000000009 } from '../database/migrations/1710000000009-UnidadesMedida';
import { ConsumosMaterial1710000000013 } from '../database/migrations/1710000000013-ConsumosMaterial';
import { ResultadosConformes1710000000014 } from '../database/migrations/1710000000014-ResultadosConformes';
import { TipoResultadoCalidad1710000000015 } from '../database/migrations/1710000000015-TipoResultadoCalidad';
import { CierresProduccion1710000000018 } from '../database/migrations/1710000000018-CierresProduccion';
import { EventosOutbox1710000000017 } from '../database/migrations/1710000000017-EventosOutbox';
import { ResultadoContableCierre1710000000021 } from '../database/migrations/1710000000021-ResultadoContableCierre';
import { EventoOutbox } from '../integraciones/outbox/entities/evento-outbox.entity';
import { loadOutboxConfig, OUTBOX_CONFIG } from '../integraciones/outbox/outbox.config';
import { OutboxPublicadorService } from '../integraciones/outbox/outbox-publicador.service';
import { TypeOrmOutboxStore } from '../integraciones/outbox/typeorm-outbox.store';
import { PUBSUB_CONFIG } from '../integraciones/pubsub/pubsub.config';
import { PubSubPublisherService } from '../integraciones/pubsub/pubsub-publisher.service';
import { PRODUCCION_CERRADA_V1 } from '../integraciones/contratos/contabilidad-v1';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { ConsumoMaterial } from '../consumos-material/entities/consumo-material.entity';
import { Material } from '../materiales/entities/material.entity';
import { Receta } from '../recetas/entities/receta.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { CierreProduccionModule } from './cierre-produccion.module';
import { CierreProduccion } from './entities/cierre-produccion.entity';

describe('ABC-299: modelo del snapshot de cierre', () => {
  it('registra version unica por orden, decimales, JSONB, fecha y relacion restrictiva', async () => {
    const source = new DataSource({ type: 'postgres', entities: [CierreProduccion, OrdenProduccion] });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(CierreProduccion);
    expect(metadata.uniques.find((unique) => unique.name === 'uq_cierres_produccion_orden_version')
      ?.columns.map((column) => column.propertyName)).toEqual(['ordenId', 'cierreVersion']);
    expect(metadata.findColumnWithPropertyName('cierreVersion')).toMatchObject({ type: 'integer', default: 1 });
    for (const property of ['cantidadProducida', 'cantidadConforme', 'cantidadDefectuosa']) {
      expect(metadata.findColumnWithPropertyName(property)).toMatchObject({ type: 'numeric', precision: 14, scale: 4, isNullable: false });
    }
    expect(metadata.findColumnWithPropertyName('consumos')?.type).toBe('jsonb');
    expect(metadata.findColumnWithPropertyName('fechaCierre')).toMatchObject({ type: 'timestamptz', isCreateDate: true });
    expect(metadata.foreignKeys[0]).toMatchObject({ name: 'fk_cierre_produccion_orden', onDelete: 'RESTRICT' });
  });
});

const describeReal = process.env.CIERRE_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-299: snapshot inmutable en PostgreSQL', () => {
  const schema = `abc299_test_${process.pid}_${Date.now()}`;
  const finalizadaAt = new Date('2026-10-15T13:00:00.000Z');
  let source: DataSource;
  let schemaCreado = false;
  let secuencia = 0;
  let apiApp: INestApplication;
  let base: string;
  let permisos: string[];
  const httpFetch = global.fetch;
  const options = (): PostgresConnectionOptions => ({
    ...(AppDataSource.options as PostgresConnectionOptions), schema,
    entities: [CierreProduccion, OrdenProduccion, AvancesProduccion, ResultadoConforme,
      ConsumoMaterial, Material, Receta, RecetaMaterial, EventoOutbox], migrations: [],
  });

  beforeAll(async () => {
    source = new DataSource(options());
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new ProduccionSchema1710000000002().up(runner);
      await new OrdenesCodigoSecuencia1710000000007().up(runner);
      await new UnidadesMedida1710000000009().up(runner);
      await new ConsumosMaterial1710000000013().up(runner);
      await new ResultadosConformes1710000000014().up(runner);
      await new TipoResultadoCalidad1710000000015().up(runner);
      await new EventosOutbox1710000000017().up(runner);
      await new CierresProduccion1710000000018().up(runner);
      await new ResultadoContableCierre1710000000021().up(runner);
      await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
      await runner.query("INSERT INTO materiales (codigo,nombre,unidad_medida) VALUES ('M1','Harina','kg'),('M2','Envase','unidad')");
      await runner.commitTransaction();
      schemaCreado = true;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    apiApp = await arrancarModulo();
    await apiApp.listen(0, '127.0.0.1');
    base = await apiApp.getUrl();
  }, 30000);

  beforeEach(() => {
    permisos = ['ordenes.finalizar_cancelar', 'ordenes.consultar'];
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Encargado de Produccion', permisos,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await apiApp?.close();
    if (source?.isInitialized) {
      try {
        if (schemaCreado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await source.destroy();
      }
    }
  });

  async function prepararOrden(estado = 'FINALIZADA', conDatos = true, fecha: Date | null = finalizadaAt) {
    const [orden] = await source.query(`INSERT INTO "${schema}".ordenes_produccion
      (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id,estado,finalizada_en)
      VALUES ($1,1,100,CURRENT_DATE,42,$2,$3) RETURNING id::text AS id`, [`O-C-${++secuencia}`, estado, fecha]);
    if (conDatos) {
      await source.query(`INSERT INTO "${schema}".avances_produccion
        (orden_id,cantidad_producida,usuario_responsable_id) VALUES ($1,40,42),($1,60,42)`, [orden.id]);
      await source.query(`INSERT INTO "${schema}".resultados_conformes
        (orden_id,cantidad,responsable_usuario_id,tipo,causa_defecto)
        VALUES ($1,95,42,'CONFORME',NULL),($1,5,42,'DEFECTUOSO','Sellado')`, [orden.id]);
      await source.query(`INSERT INTO "${schema}".consumos_material
        (orden_id,material_id,cantidad,unidad,usuario_registro_id)
        VALUES ($1,1,10,'kg',42),($1,1,13,'kg',42),($1,2,4,'unidad',42),($1,1,500,'g',42)`, [orden.id]);
    }
    return String(orden.id);
  }

  // Fixture de las pruebas del modelo. Las pruebas HTTP de abajo construyen
  // el snapshot mediante el servicio real, sin usar este helper.
  async function datosSnapshot(ordenId: string): Promise<DeepPartial<CierreProduccion>> {
    const [orden] = await source.query(`SELECT o.*, r.producto_codigo, r.producto_nombre, r.unidad_producto
      FROM "${schema}".ordenes_produccion o JOIN "${schema}".recetas r ON r.id = o.receta_id WHERE o.id = $1`, [ordenId]);
    const [avance] = await source.query(`SELECT COALESCE(SUM(cantidad_producida),0)::numeric(14,4)::text AS cantidad
      FROM "${schema}".avances_produccion WHERE orden_id = $1`, [ordenId]);
    const [calidad] = await source.query(`SELECT
      COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'CONFORME'),0)::numeric(14,4)::text AS conforme,
      COALESCE(SUM(cantidad) FILTER (WHERE tipo = 'DEFECTUOSO'),0)::numeric(14,4)::text AS defectuosa
      FROM "${schema}".resultados_conformes WHERE orden_id = $1`, [ordenId]);
    const consumos = await source.query(`SELECT m.id::text AS "materialId", m.codigo AS "materialCodigo",
      m.nombre AS "materialNombre", SUM(c.cantidad)::text AS cantidad, c.unidad
      FROM "${schema}".consumos_material c JOIN "${schema}".materiales m ON m.id = c.material_id
      WHERE c.orden_id = $1 GROUP BY m.id, m.codigo, m.nombre, c.unidad ORDER BY m.id, c.unidad`, [ordenId]);
    return {
      ordenId, ordenCodigo: orden.codigo,
      producto: { productoId: Number(orden.receta_id), codigo: orden.producto_codigo, nombre: orden.producto_nombre, unidad: orden.unidad_producto },
      cantidadSolicitada: orden.cantidad_solicitada, cantidadProducida: avance.cantidad,
      cantidadConforme: calidad.conforme, cantidadDefectuosa: calidad.defectuosa,
      consumos, finalizadaAt: orden.finalizada_en ?? finalizadaAt,
    };
  }

  async function arrancarModulo() {
    const module = await Test.createTestingModule({ imports: [TypeOrmModule.forRoot(options()), CierreProduccionModule] })
      .overrideProvider(PUBSUB_CONFIG).useValue({ enabled: false, projectId: 'test', topicId: 'eventos' })
      .overrideProvider(OUTBOX_CONFIG).useValue(loadOutboxConfig({ PUBSUB_ENABLED: 'false' }))
      .compile();
    const app = module.createNestApplication();
    await app.init();
    return app;
  }

  async function request(path = '', method = 'POST', data: unknown = {}) {
    const response = await httpFetch(`${base}/cierres-produccion${path}`, {
      method, headers: { Authorization: 'Bearer prueba', 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  it('persiste 100 producidas, 95 conformes, 5 defectuosas y consumos al reiniciar la aplicacion Nest', async () => {
    const ordenId = await prepararOrden();
    const datos = await datosSnapshot(ordenId);
    const app = await arrancarModulo();
    let guardado: CierreProduccion;
    try {
      const repository = app.get(DataSource).getRepository(CierreProduccion);
      guardado = await repository.save(repository.create(datos));
      expect(guardado).toMatchObject({ cierreVersion: 1, cantidadProducida: '100.0000', cantidadConforme: '95.0000', cantidadDefectuosa: '5.0000' });
      expect(guardado.fechaCierre).toBeInstanceOf(Date);
    } finally {
      await app.close();
    }
    const reiniciada = await arrancarModulo();
    try {
      const leido = await reiniciada.get(DataSource).getRepository(CierreProduccion).findOneOrFail({ where: { id: guardado.id }, relations: { orden: true } });
      expect(leido).toMatchObject(guardado);
      expect(leido.ordenId).toBe(ordenId);
      expect(String(leido.orden.id)).toBe(ordenId);
      expect(leido.consumos).toEqual(expect.arrayContaining([
        expect.objectContaining({ materialId: '1', cantidad: '23.0000', unidad: 'kg' }),
        expect.objectContaining({ materialId: '1', cantidad: '500.0000', unidad: 'g' }),
        expect.objectContaining({ materialId: '2', cantidad: '4.0000', unidad: 'unidad' }),
      ]));
      expect(leido.consumos).toHaveLength(3);
    } finally {
      await reiniciada.close();
    }
  });

  it('conserva el snapshot aunque cambien orden, avances, calidad, consumos y nombres del catalogo', async () => {
    const ordenId = await prepararOrden();
    const repository = source.getRepository(CierreProduccion);
    const guardado = await repository.save(await datosSnapshot(ordenId));
    await source.query(`UPDATE "${schema}".avances_produccion SET cantidad_producida = 30 WHERE orden_id = $1`, [ordenId]);
    await source.query(`UPDATE "${schema}".resultados_conformes SET cantidad = 10 WHERE orden_id = $1`, [ordenId]);
    await source.query(`UPDATE "${schema}".consumos_material SET cantidad = 1 WHERE orden_id = $1`, [ordenId]);
    await source.query(`UPDATE "${schema}".ordenes_produccion SET codigo = $2, cantidad_solicitada = 120, finalizada_en = NOW() WHERE id = $1`, [ordenId, `O-CORREGIDA-${ordenId}`]);
    await source.query(`UPDATE "${schema}".materiales SET nombre = 'Nombre nuevo' WHERE id = 1`);
    await source.query(`UPDATE "${schema}".recetas SET producto_nombre = 'Otro nombre', unidad_producto = 'caja' WHERE id = 1`);
    expect(await repository.findOneByOrFail({ id: guardado.id })).toEqual(guardado);
  });

  it('rechaza duplicados de orden y version y permite otra version sin modificar la primera', async () => {
    const ordenId = await prepararOrden();
    const repository = source.getRepository(CierreProduccion);
    const datos = await datosSnapshot(ordenId);
    const primero = await repository.save({ ...datos });
    await expect(repository.save({ ...datos, cierreVersion: 1 })).rejects.toMatchObject({
      driverError: { code: '23505', constraint: 'uq_cierres_produccion_orden_version' },
    });
    expect(await repository.countBy({ ordenId })).toBe(1);
    await repository.save({ ...datos, cierreVersion: 2 });
    expect(await repository.countBy({ ordenId })).toBe(2);
    expect(await repository.findOneByOrFail({ id: primero.id })).toEqual(primero);
  });

  it('la unicidad tambien rechaza el duplicado concurrente sin dejar dos snapshots', async () => {
    const ordenId = await prepararOrden();
    const datos = await datosSnapshot(ordenId);
    const repository = source.getRepository(CierreProduccion);
    const resultados = await Promise.allSettled([repository.save({ ...datos }), repository.save({ ...datos })]);
    expect(resultados.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const fallo = resultados.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(fallo.reason.driverError.code).toBe('23505');
    expect(await repository.countBy({ ordenId })).toBe(1);
  });

  it.each(['PENDIENTE', 'PLANIFICADA', 'EN_PRODUCCION', 'CANCELADA'])('rechaza una orden %s', async (estado) => {
    const ordenId = await prepararOrden(estado);
    const repository = source.getRepository(CierreProduccion);
    await expect(repository.save(await datosSnapshot(ordenId))).rejects.toMatchObject({
      driverError: { code: '23514', constraint: 'ck_cierre_produccion_orden_finalizada' },
    });
    expect(await repository.countBy({ ordenId })).toBe(0);
  });

  it('rechaza una orden FINALIZADA sin fecha de finalizacion', async () => {
    const ordenId = await prepararOrden('FINALIZADA', false, null);
    await expect(source.getRepository(CierreProduccion).save(await datosSnapshot(ordenId))).rejects.toMatchObject({ driverError: { code: '23514' } });
  });

  it('impide UPDATE, cambios JSONB, DELETE y TRUNCATE sin alterar el snapshot', async () => {
    const ordenId = await prepararOrden();
    const repository = source.getRepository(CierreProduccion);
    const guardado = await repository.save(await datosSnapshot(ordenId));
    await expect(repository.update(guardado.id, { cantidadConforme: '1.0000' })).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(source.query(`UPDATE "${schema}".cierres_produccion SET consumos = '[]'::jsonb WHERE id = $1`, [guardado.id]))
      .rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(repository.delete(guardado.id)).rejects.toMatchObject({ driverError: { code: '55000' } });
    await expect(source.query(`TRUNCATE "${schema}".cierres_produccion`)).rejects.toMatchObject({ driverError: { code: '55000' } });
    expect(await repository.findOneByOrFail({ id: guardado.id })).toEqual(guardado);
  });

  const invalidos: Array<[keyof CierreProduccion, unknown, string]> = [
    ['cierreVersion', 0, '23514'], ['cierreVersion', -1, '23514'],
    ['cantidadProducida', '-1.0000', '23514'], ['cantidadProducida', 'NaN', '23514'],
    ['cantidadConforme', '-1.0000', '23514'], ['cantidadDefectuosa', '-1.0000', '23514'],
    ['cantidadConforme', '96.0000', '23514'], ['cantidadSolicitada', '0', '23514'],
    ['cantidadConforme', null, '23502'], ['fechaCierre', null, '23502'],
    ['consumos', {}, '23514'], ['producto', [], '23514'],
  ];
  it.each(invalidos)('rechaza %s=%s sin persistir', async (campo, valor, code) => {
    const ordenId = await prepararOrden();
    const datos = await datosSnapshot(ordenId);
    const repository = source.getRepository(CierreProduccion);
    await expect(repository.save({ ...datos, [campo]: valor })).rejects.toMatchObject({ driverError: { code } });
    expect(await repository.countBy({ ordenId })).toBe(0);
  });

  it('permite cero producidas y consumos vacios; la FK protege la orden y rechaza una inexistente', async () => {
    const ordenId = await prepararOrden('FINALIZADA', false);
    const datos = await datosSnapshot(ordenId);
    const repository = source.getRepository(CierreProduccion);
    expect((await repository.save({ ...datos })).consumos).toEqual([]);
    await expect(source.query(`DELETE FROM "${schema}".ordenes_produccion WHERE id = $1`, [ordenId]))
      .rejects.toMatchObject({ driverError: { code: '23503', constraint: 'fk_cierre_produccion_orden' } });
    await expect(repository.save({ ...datos, ordenId: '999999' })).rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  it('revierte y reaplica la migracion con sus triggers en el esquema aislado', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      const migration = new CierresProduccion1710000000018();
      await migration.down(runner);
      expect((await runner.query("SELECT to_regclass('cierres_produccion') AS tabla"))[0].tabla).toBeNull();
      await migration.up(runner);
      const [triggers] = await runner.query(`SELECT COUNT(*)::int AS total FROM pg_trigger WHERE tgrelid = 'cierres_produccion'::regclass AND NOT tgisinternal`);
      expect(triggers.total).toBe(3);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('API 201/200: prepara los totales reales y devuelve exactamente lo persistido al consultar', async () => {
    const ordenId = await prepararOrden();
    const creado = await request('', 'POST', { ordenId: Number(ordenId) });
    expect(creado.status).toBe(201);
    expect(creado.body).toMatchObject({ ordenId, cierreVersion: 1, cantidadProducida: '100.0000', cantidadConforme: '95.0000', cantidadDefectuosa: '5.0000' });
    expect(creado.body.consumos).toEqual(expect.arrayContaining([
      expect.objectContaining({ materialId: '1', cantidad: '23.0000', unidad: 'kg' }),
      expect.objectContaining({ materialId: '1', cantidad: '500.0000', unidad: 'g' }),
      expect.objectContaining({ materialId: '2', cantidad: '4.0000', unidad: 'unidad' }),
    ]));
    expect(creado.body.consumos).toHaveLength(3);
    const guardado = await source.getRepository(CierreProduccion).findOneByOrFail({ id: creado.body.id });
    expect(creado.body).toEqual(JSON.parse(JSON.stringify(guardado)));
    expect(await request(`/orden/${ordenId}`, 'GET')).toEqual({ status: 200, body: creado.body });
  });

  it('API 409: repetir la misma solicitud no genera una version adicional ni modifica la anterior', async () => {
    const ordenId = await prepararOrden();
    const creado = await request('', 'POST', { ordenId: Number(ordenId), cierreVersion: 1 });
    expect(creado.status).toBe(201);
    expect((await request('', 'POST', { ordenId: Number(ordenId), cierreVersion: 1 })).status).toBe(409);
    expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(1);
    expect((await request(`/orden/${ordenId}`, 'GET')).body).toEqual(creado.body);
  });

  it.each(['consumos', 'clasificacion'])('ABC-299 subtarea 3: corregir %s no cambia el snapshot ni genera otra version al repetir', async (origen) => {
    const ordenId = await prepararOrden();
    const primero = await request('', 'POST', { ordenId: Number(ordenId) });
    expect(primero.status).toBe(201);
    expect(await request(`/orden/${ordenId}`, 'GET')).toEqual({ status: 200, body: primero.body });

    // La API no expone edicion de fuentes. Estas correcciones son fixtures SQL
    // del esquema aislado, respetando las restricciones existentes de calidad.
    if (origen === 'consumos') {
      await source.query(`UPDATE "${schema}".consumos_material SET cantidad = 0.5, unidad = 'kg'
        WHERE orden_id = $1 AND material_id = 1 AND unidad = 'g'`, [ordenId]);
      expect(await source.query(`SELECT SUM(cantidad)::text AS cantidad, unidad FROM "${schema}".consumos_material
        WHERE orden_id = $1 AND material_id = 1 GROUP BY unidad`, [ordenId]))
        .toEqual([{ cantidad: '23.5000', unidad: 'kg' }]);
    } else {
      await source.query(`UPDATE "${schema}".resultados_conformes SET tipo = 'CONFORME', causa_defecto = NULL
        WHERE orden_id = $1 AND tipo = 'DEFECTUOSO'`, [ordenId]);
      expect(await source.query(`SELECT tipo, SUM(cantidad)::text AS cantidad FROM "${schema}".resultados_conformes
        WHERE orden_id = $1 GROUP BY tipo`, [ordenId]))
        .toEqual([{ tipo: 'CONFORME', cantidad: '100.0000' }]);
    }

    const repetido = await request('', 'POST', { ordenId: Number(ordenId) });
    expect(repetido.status).toBe(409);
    expect(await request(`/orden/${ordenId}`, 'GET')).toEqual({ status: 200, body: primero.body });
    expect((await request(`/orden/${ordenId}?cierreVersion=2`, 'GET')).status).toBe(404);
    const persistidos = await source.getRepository(CierreProduccion).findBy({ ordenId });
    expect(JSON.parse(JSON.stringify(persistidos))).toEqual([primero.body]);
    expect(primero.body).toMatchObject({ cantidadProducida: '100.0000', cantidadConforme: '95.0000', cantidadDefectuosa: '5.0000' });
    expect(primero.body.consumos).toEqual(expect.arrayContaining([
      expect.objectContaining({ materialId: '1', cantidad: '23.0000', unidad: 'kg' }),
      expect.objectContaining({ materialId: '1', cantidad: '500.0000', unidad: 'g' }),
      expect.objectContaining({ materialId: '2', cantidad: '4.0000', unidad: 'unidad' }),
    ]));
  });

  it('ABC-299 subtarea 3: la correccion requiere una version explicita y ambas quedan congeladas tras reiniciar', async () => {
    const ordenId = await prepararOrden();
    const primero = await request('', 'POST', { ordenId: Number(ordenId) });
    expect(primero.status).toBe(201);
    await source.query(`UPDATE "${schema}".resultados_conformes SET tipo = 'CONFORME', causa_defecto = NULL
      WHERE orden_id = $1 AND tipo = 'DEFECTUOSO'`, [ordenId]);
    await source.query(`UPDATE "${schema}".consumos_material SET cantidad = 0.5, unidad = 'kg'
      WHERE orden_id = $1 AND material_id = 1 AND unidad = 'g'`, [ordenId]);
    expect(await request(`/orden/${ordenId}`, 'GET')).toEqual({ status: 200, body: primero.body });
    expect((await request(`/orden/${ordenId}?cierreVersion=2`, 'GET')).status).toBe(404);
    const segundo = await request('', 'POST', { ordenId: Number(ordenId), cierreVersion: 2 });
    expect(segundo.status).toBe(201);
    expect(segundo.body.id).not.toBe(primero.body.id);
    expect(segundo.body).toMatchObject({ cierreVersion: 2, cantidadProducida: '100.0000', cantidadConforme: '100.0000', cantidadDefectuosa: '0.0000' });
    expect(segundo.body.consumos).toEqual([
      expect.objectContaining({ materialId: '1', cantidad: '23.5000', unidad: 'kg' }),
      expect.objectContaining({ materialId: '2', cantidad: '4.0000', unidad: 'unidad' }),
    ]);

    // Otra correccion de las fuentes tampoco debe recalcular versiones ya creadas.
    await source.query(`UPDATE "${schema}".consumos_material SET cantidad = 20
      WHERE orden_id = $1 AND material_id = 1`, [ordenId]);
    await source.query(`UPDATE "${schema}".resultados_conformes SET tipo = 'DEFECTUOSO', causa_defecto = 'Revision posterior'
      WHERE orden_id = $1 AND cantidad = 5`, [ordenId]);
    for (const cierreVersion of [1, 2]) {
      expect((await request('', 'POST', { ordenId: Number(ordenId), cierreVersion })).status).toBe(409);
    }
    expect((await request(`/orden/${ordenId}?cierreVersion=3`, 'GET')).status).toBe(404);
    expect(await request(`/orden/${ordenId}?cierreVersion=2`, 'GET')).toEqual({ status: 200, body: segundo.body });
    expect(await request(`/orden/${ordenId}`, 'GET')).toEqual({ status: 200, body: primero.body });

    await apiApp.close();
    apiApp = await arrancarModulo();
    await apiApp.listen(0, '127.0.0.1');
    base = await apiApp.getUrl();
    expect(await request(`/orden/${ordenId}?cierreVersion=1`, 'GET')).toEqual({ status: 200, body: primero.body });
    expect(await request(`/orden/${ordenId}?cierreVersion=2`, 'GET')).toEqual({ status: 200, body: segundo.body });
    const persistidos = await source.getRepository(CierreProduccion).find({ where: { ordenId }, order: { cierreVersion: 'ASC' } });
    expect(JSON.parse(JSON.stringify(persistidos))).toEqual([primero.body, segundo.body]);
    expect((await source.getRepository(OrdenProduccion).findOneByOrFail({ id: Number(ordenId) })).estado).toBe('FINALIZADA');
  });

  it('ABC-299 subtarea 3: una correccion inconsistente rechaza la version nueva sin alterar la anterior', async () => {
    const ordenId = await prepararOrden();
    const primero = await request('', 'POST', { ordenId: Number(ordenId) });
    expect(primero.status).toBe(201);
    await source.query(`UPDATE "${schema}".resultados_conformes SET cantidad = 101
      WHERE orden_id = $1 AND tipo = 'CONFORME'`, [ordenId]);
    expect((await request('', 'POST', { ordenId: Number(ordenId), cierreVersion: 2 })).status).toBe(409);
    expect((await request(`/orden/${ordenId}?cierreVersion=2`, 'GET')).status).toBe(404);
    expect(await request(`/orden/${ordenId}?cierreVersion=1`, 'GET')).toEqual({ status: 200, body: primero.body });
    const persistidos = await source.getRepository(CierreProduccion).findBy({ ordenId });
    expect(JSON.parse(JSON.stringify(persistidos))).toEqual([primero.body]);
  });

  it('API 404: una orden inexistente o una version no preparada no crea datos', async () => {
    const repository = source.getRepository(CierreProduccion);
    const anteriores = await repository.count();
    expect((await request('', 'POST', { ordenId: 999999 })).status).toBe(404);
    expect((await request('/orden/999999', 'GET')).status).toBe(404);
    const ordenId = await prepararOrden();
    expect((await request(`/orden/${ordenId}`, 'GET')).status).toBe(404);
    expect(await repository.count()).toBe(anteriores);
  });

  it.each(['PENDIENTE', 'PLANIFICADA', 'EN_PRODUCCION', 'CANCELADA'])('API 409: orden %s no guarda un cierre parcial', async (estado) => {
    const ordenId = await prepararOrden(estado);
    expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(409);
    expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(0);
  });

  it('API 409: una orden finalizada sin fecha o con clasificados superiores a producidas se rechaza', async () => {
    const sinFecha = await prepararOrden('FINALIZADA', false, null);
    expect((await request('', 'POST', { ordenId: Number(sinFecha) })).status).toBe(409);
    const inconsistente = await prepararOrden();
    await source.query(`UPDATE "${schema}".resultados_conformes SET cantidad = 101 WHERE orden_id = $1 AND tipo = 'CONFORME'`, [inconsistente]);
    expect((await request('', 'POST', { ordenId: Number(inconsistente) })).status).toBe(409);
    expect(await source.getRepository(CierreProduccion).countBy({ ordenId: inconsistente })).toBe(0);
  });

  it('API 403: sin permiso no prepara ni consulta un snapshot', async () => {
    const ordenId = await prepararOrden();
    permisos = ['ordenes.registrar_avance'];
    expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(403);
    expect((await request(`/orden/${ordenId}`, 'GET')).status).toBe(403);
    expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(0);
  });

  it('API: dos preparaciones simultaneas dejan un solo snapshot y el segundo intento recibe 409', async () => {
    const ordenId = await prepararOrden();
    const resultados = await Promise.all([
      request('', 'POST', { ordenId: Number(ordenId) }), request('', 'POST', { ordenId: Number(ordenId) }),
    ]);
    expect(resultados.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(1);
  });

  it('API: admite una orden finalizada sin movimientos con totales cero y consumos vacios', async () => {
    const ordenId = await prepararOrden('FINALIZADA', false);
    const response = await request('', 'POST', { ordenId: Number(ordenId) });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ cantidadProducida: '0.0000', cantidadConforme: '0.0000', cantidadDefectuosa: '0.0000', consumos: [] });
  });

  it('API: sumas de consumos grandes conservan sus decimales sin convertirlas a number', async () => {
    const ordenId = await prepararOrden();
    await source.query(`UPDATE "${schema}".consumos_material SET cantidad = 9999999999.9999 WHERE orden_id = $1 AND material_id = 1 AND unidad = 'kg'`, [ordenId]);
    const response = await request('', 'POST', { ordenId: Number(ordenId) });
    expect(response.status).toBe(201);
    expect(response.body.consumos).toContainEqual(expect.objectContaining({ materialId: '1', cantidad: '19999999999.9998', unidad: 'kg' }));
  });

  it('API: si falla despues del INSERT la transaccion revierte el snapshot completo', async () => {
    const ordenId = await prepararOrden();
    const appSource = apiApp.get(DataSource);
    const originalRunner = appSource.createQueryRunner.bind(appSource);
    let insertEjecutado = false;
    jest.spyOn(appSource, 'createQueryRunner').mockImplementation((mode) => {
      const runner = originalRunner(mode);
      const query = runner.query.bind(runner);
      jest.spyOn(runner, 'query').mockImplementation(async (sql, parameters, structured) => {
        const result = await query(sql, parameters, structured);
        if (typeof sql === 'string' && sql.startsWith('INSERT INTO') && sql.includes('"cierres_produccion"')) {
          insertEjecutado = true;
          throw new Error('Fallo simulado despues de insertar el snapshot');
        }
        return result;
      });
      return runner;
    });
    expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(500);
    expect(insertEjecutado).toBe(true);
    expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(0);
  });

  describe('ABC-121: cierre y publicacion confiable mediante outbox', () => {
    beforeEach(async () => {
      // Aisla los trabajos pendientes de los fixtures anteriores en este esquema de prueba.
      await source.query(`TRUNCATE "${schema}".eventos_outbox RESTART IDENTITY`);
    });

    function publicador(publishMessage: jest.Mock, store = new TypeOrmOutboxStore(source)) {
      const publisher = new PubSubPublisherService(
        { enabled: true, projectId: 'test', topicId: 'eventos' },
        { topic: () => ({ publishMessage }) } as any,
      );
      return new OutboxPublicadorService(store, publisher, {
        ...loadOutboxConfig({ PUBSUB_ENABLED: 'false' }), retryBaseMs: 60000, retryMaxMs: 60000,
      });
    }

    it('201: prepara snapshot y un unico evento pendiente con las cantidades y unidades congeladas', async () => {
      const ordenId = await prepararOrden();
      const creado = await request('', 'POST', { ordenId: Number(ordenId) });
      expect(creado.status).toBe(201);
      const [evento] = await source.getRepository(EventoOutbox).find();
      expect(evento).toMatchObject({
        aggregateType: 'CierreProduccion', aggregateId: creado.body.id,
        eventType: PRODUCCION_CERRADA_V1, estado: 'PENDIENTE', intentos: 0, messageId: null, publicadoEn: null,
        payload: {
          eventId: evento.eventId, correlationId: evento.correlationId,
          eventType: PRODUCCION_CERRADA_V1, source: 'produccion-service', occurredAt: creado.body.fechaCierre,
          data: {
            cierreId: creado.body.id, resumenId: creado.body.id, cierreVersion: 1,
            ordenId: Number(ordenId), ordenCodigo: creado.body.ordenCodigo,
            producto: creado.body.producto, cantidadSolicitada: '100.0000', cantidadConforme: '95.0000',
            consumos: creado.body.consumos, finalizadaAt: creado.body.finalizadaAt,
          },
        },
      });
      expect(evento.payload.data).not.toHaveProperty('estado', 'RECIBIDO');
      expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(409);
      expect(await source.getRepository(EventoOutbox).find()).toEqual([evento]);
      expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(1);
    });

    it('404/409: una orden inexistente o no finalizada no deja snapshot ni evento', async () => {
      const ordenId = await prepararOrden('EN_PRODUCCION');
      expect((await request('', 'POST', { ordenId: 999999 })).status).toBe(404);
      expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(409);
      expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(0);
      expect(await source.getRepository(EventoOutbox).count()).toBe(0);
    });

    it('revierte tambien el snapshot cuando la BD rechaza el INSERT del evento', async () => {
      const ordenId = await prepararOrden();
      await source.query(`ALTER TABLE "${schema}".eventos_outbox ADD CONSTRAINT ck_abc121_fallo
        CHECK (event_type <> 'ProduccionCerrada.v1')`);
      try {
        expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(500);
        expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(0);
        expect(await source.getRepository(EventoOutbox).count()).toBe(0);
      } finally {
        await source.query(`ALTER TABLE "${schema}".eventos_outbox DROP CONSTRAINT ck_abc121_fallo`);
      }
      expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(201);
      expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(1);
      expect(await source.getRepository(EventoOutbox).count()).toBe(1);
    });

    it('el publicador no puede ver ni enviar el evento antes del commit de negocio', async () => {
      const ordenId = await prepararOrden();
      const publishMessage = jest.fn().mockResolvedValue('mensaje-despues-del-commit');
      const worker = publicador(publishMessage);
      const appSource = apiApp.get(DataSource);
      const originalRunner = appSource.createQueryRunner.bind(appSource);
      let verificadoAntesDelCommit = false;
      jest.spyOn(appSource, 'createQueryRunner').mockImplementation((mode) => {
        const runner = originalRunner(mode);
        const commit = runner.commitTransaction.bind(runner);
        jest.spyOn(runner, 'commitTransaction').mockImplementation(async () => {
          expect(await runner.query(`SELECT COUNT(*)::int AS total FROM "${schema}".eventos_outbox`))
            .toEqual([{ total: 1 }]);
          expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(0);
          await expect(worker.procesarPendientes()).resolves.toEqual({ reclamados: 0, publicados: 0, fallidos: 0, resultadosObsoletos: 0 });
          expect(publishMessage).not.toHaveBeenCalled();
          verificadoAntesDelCommit = true;
          await commit();
        });
        return runner;
      });
      expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(201);
      expect(verificadoAntesDelCommit).toBe(true);
      await expect(worker.procesarPendientes()).resolves.toEqual({ reclamados: 1, publicados: 1, fallidos: 0, resultadosObsoletos: 0 });
      expect(publishMessage).toHaveBeenCalledTimes(1);
    });

    it('con broker caido conserva el evento; tras reiniciar publica el mismo payload sin repetir el cierre', async () => {
      const ordenId = await prepararOrden();
      const creado = await request('', 'POST', { ordenId: Number(ordenId) });
      expect(creado.status).toBe(201);
      const repository = source.getRepository(EventoOutbox);
      const [original] = await repository.find();
      const publishMessage = jest.fn().mockRejectedValueOnce(new Error('Pub/Sub no disponible'))
        .mockResolvedValue('mensaje-cierre-recuperado');
      await expect(publicador(publishMessage).procesarPendientes())
        .resolves.toEqual({ reclamados: 1, publicados: 0, fallidos: 1, resultadosObsoletos: 0 });
      const pendiente = await repository.findOneByOrFail({ id: original.id });
      expect(pendiente).toMatchObject({ estado: 'PENDIENTE', intentos: 1,
        eventId: original.eventId, correlationId: original.correlationId, payload: original.payload,
        messageId: null, publicadoEn: null, ultimoError: 'Pub/Sub no disponible' });

      await source.query(`UPDATE "${schema}".consumos_material SET cantidad = 1 WHERE orden_id = $1`, [ordenId]);
      await source.query(`UPDATE "${schema}".resultados_conformes SET tipo = 'CONFORME', causa_defecto = NULL
        WHERE orden_id = $1 AND tipo = 'DEFECTUOSO'`, [ordenId]);
      await apiApp.close();
      apiApp = await arrancarModulo();
      await apiApp.listen(0, '127.0.0.1');
      base = await apiApp.getUrl();
      expect(await request(`/orden/${ordenId}`, 'GET')).toEqual({ status: 200, body: creado.body });
      expect(await repository.findOneByOrFail({ id: original.id })).toEqual(pendiente);

      const workerReiniciado = publicador(publishMessage, new TypeOrmOutboxStore(apiApp.get(DataSource)));
      await expect(workerReiniciado.procesarPendientes(pendiente.proximoIntentoEn))
        .resolves.toEqual({ reclamados: 1, publicados: 1, fallidos: 0, resultadosObsoletos: 0 });
      const publicado = await repository.findOneByOrFail({ id: original.id });
      expect(publicado).toMatchObject({ estado: 'PUBLICADO', intentos: 2,
        messageId: 'mensaje-cierre-recuperado', ultimoError: null,
        eventId: original.eventId, correlationId: original.correlationId, payload: original.payload });
      expect(publicado.publicadoEn).toBeInstanceOf(Date);
      expect(publishMessage.mock.calls[0][0]).toEqual(publishMessage.mock.calls[1][0]);
      const mensaje = publishMessage.mock.calls[1][0];
      expect(JSON.parse(mensaje.data.toString('utf8'))).toEqual(original.payload);
      expect(mensaje.attributes.eventId).toBe(original.eventId);
      expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(409);
      await expect(workerReiniciado.procesarPendientes()).resolves.toEqual({ reclamados: 0, publicados: 0, fallidos: 0, resultadosObsoletos: 0 });
      expect(publishMessage).toHaveBeenCalledTimes(2);
      expect(await repository.count()).toBe(1);
      expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(1);
      expect((await source.getRepository(OrdenProduccion).findOneByOrFail({ id: Number(ordenId) })).estado).toBe('FINALIZADA');
    });

    it('dos POST simultaneos dejan un solo cierre y un solo evento', async () => {
      const ordenId = await prepararOrden();
      const respuestas = await Promise.all([
        request('', 'POST', { ordenId: Number(ordenId) }), request('', 'POST', { ordenId: Number(ordenId) }),
      ]);
      expect(respuestas.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(1);
      expect(await source.getRepository(EventoOutbox).count()).toBe(1);
    });

    it('si se pierde la confirmacion local de Google, reenvia el mismo eventId sin otro efecto de negocio', async () => {
      const ordenId = await prepararOrden();
      expect((await request('', 'POST', { ordenId: Number(ordenId) })).status).toBe(201);
      const repository = source.getRepository(EventoOutbox);
      const [original] = await repository.find();
      const store = new TypeOrmOutboxStore(source);
      jest.spyOn(store, 'marcarPublicado').mockRejectedValueOnce(new Error('Fallo temporal al guardar confirmacion'));
      const publishMessage = jest.fn().mockResolvedValueOnce('mensaje-1').mockResolvedValueOnce('mensaje-2');
      const worker = publicador(publishMessage, store);
      await expect(worker.procesarPendientes()).resolves.toMatchObject({ fallidos: 1, publicados: 0 });
      const pendiente = await repository.findOneByOrFail({ id: original.id });
      expect(pendiente).toMatchObject({ estado: 'PENDIENTE', eventId: original.eventId, messageId: null });
      await expect(worker.procesarPendientes(pendiente.proximoIntentoEn)).resolves.toMatchObject({ publicados: 1, fallidos: 0 });
      expect(publishMessage.mock.calls[0][0]).toEqual(publishMessage.mock.calls[1][0]);
      expect(await repository.findOneByOrFail({ id: original.id })).toMatchObject({
        estado: 'PUBLICADO', eventId: original.eventId, messageId: 'mensaje-2', intentos: 2,
      });
      expect(await source.getRepository(CierreProduccion).countBy({ ordenId })).toBe(1);
      expect(await repository.count()).toBe(1);
    });
  });
});
