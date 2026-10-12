import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { ResultadosConformes1710000000014 } from '../database/migrations/1710000000014-ResultadosConformes';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { ResultadoConforme } from './entities/resultado-conforme.entity';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { CalidadService } from './calidad.service';

const entities = [ResultadoConforme, OrdenProduccion, AvancesProduccion];

describe('ABC-82: metadatos de ResultadoConforme', () => {
  it('registra relacion, campos obligatorios, fecha automatica y precision', async () => {
    const source = new DataSource({ type: 'postgres', entities });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(ResultadoConforme);
    expect(metadata.findRelationWithPropertyPath('orden')).toMatchObject({ onDelete: 'RESTRICT' });
    expect(metadata.findColumnWithPropertyName('cantidad')).toMatchObject({ precision: 14, scale: 4, isNullable: false });
    expect(metadata.findColumnWithPropertyName('responsableUsuarioId')?.isNullable).toBe(false);
    expect(metadata.findColumnWithPropertyName('fechaHora')).toMatchObject({ type: 'timestamptz', isCreateDate: true });
  });
});

const describeReal = process.env.CALIDAD_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-82: persistencia PostgreSQL de ResultadoConforme', () => {
  const schema = `abc82_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let schemaCreado = false;

  beforeAll(async () => {
    source = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), schema, entities, migrations: [] });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new ProduccionSchema1710000000002().up(runner);
      await new OrdenesCodigoSecuencia1710000000007().up(runner);
      await new ResultadosConformes1710000000014().up(runner);
      await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
      await runner.query("INSERT INTO ordenes_produccion (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id) VALUES ('O1',1,100,CURRENT_DATE,42)");
      await runner.commitTransaction();
      schemaCreado = true;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }, 30000);

  afterAll(async () => {
    if (schemaCreado && !source.isInitialized) await source.initialize();
    if (source?.isInitialized) {
      try {
        if (schemaCreado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await source.destroy();
      }
    }
  });

  it('conserva el resultado confirmado al cerrar y reabrir la conexion', async () => {
    const resultado = await source.getRepository(ResultadoConforme).save({
      ordenId: '1', cantidad: '23.1250', responsableUsuarioId: '42',
    });
    await source.destroy();
    await source.initialize();
    const leido = await source.getRepository(ResultadoConforme).findOneOrFail({
      where: { id: resultado.id }, relations: { orden: true },
    });
    expect(leido).toMatchObject({ cantidad: '23.1250', responsableUsuarioId: '42', ordenId: '1' });
    expect(leido.fechaHora).toBeInstanceOf(Date);
    expect(leido.fechaHora.getTime()).toBe(resultado.fechaHora.getTime());
    expect(leido.orden.codigo).toBe('O1');
  });

  it.each([
    ['0', '42', '1', '23514'],
    ['-1', '42', '1', '23514'],
    ['NaN', '42', '1', '23514'],
    [null, '42', '1', '23502'],
    ['1', null, '1', '23502'],
    ['1', '0', '1', '23514'],
    ['1', '42', '999', '23503'],
    ['1', '42', null, '23502'],
  ])('rechaza cantidad=%s responsable=%s orden=%s', async (cantidad, responsable, orden, code) => {
    await expect(source.query(`INSERT INTO "${schema}".resultados_conformes
      (cantidad,responsable_usuario_id,orden_id) VALUES ($1,$2,$3)`, [cantidad, responsable, orden]))
      .rejects.toMatchObject({ driverError: { code } });
  });

  it('protege la orden referenciada contra borrado', async () => {
    await expect(source.getRepository(OrdenProduccion).delete(1)).rejects.toMatchObject({ code: '23503' });
  });

  it('revierte y reaplica la migracion conservando las ordenes', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      const migration = new ResultadosConformes1710000000014();
      await migration.down(runner);
      const [tabla] = await runner.query('SELECT to_regclass($1) AS resultado', [`${schema}.resultados_conformes`]);
      expect(tabla.resultado).toBeNull();
      expect(await runner.manager.count(OrdenProduccion)).toBe(1);
      await migration.up(runner);
      expect(await runner.manager.count(ResultadoConforme)).toBe(0);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  async function prepararOrden(cantidades: number[]) {
    const [orden] = await source.query(`INSERT INTO "${schema}".ordenes_produccion
      (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id)
      VALUES ($1,1,100,CURRENT_DATE,42) RETURNING id::text AS id`, [`O-${Date.now()}-${Math.random()}`]);
    for (const cantidad of cantidades) {
      await source.getRepository(AvancesProduccion).save({
        orden_id: orden.id, cantidad_producida: cantidad, usuario_responsable_id: '42',
      });
    }
    return Number(orden.id);
  }

  it('acepta hasta el producido real, rechaza exceso y conserva los registros anteriores', async () => {
    const ordenId = await prepararOrden([10, 13]);
    const service = new CalidadService(source.getRepository(ResultadoConforme), source);
    await service.registrarConforme({ ordenId, cantidad: 10 }, 42);
    await service.registrarConforme({ ordenId, cantidad: 13 }, 43);
    const anteriores = await service.consultarConformes(ordenId);
    expect(anteriores.map((resultado) => resultado.cantidad)).toEqual(['10.0000', '13.0000']);
    await expect(service.registrarConforme({ ordenId, cantidad: 1 }, 42)).rejects.toMatchObject({ status: 409 });
    expect(await service.consultarConformes(ordenId)).toEqual(anteriores);
  });

  it('sin avances rechaza el registro sin dejar datos parciales', async () => {
    const ordenId = await prepararOrden([]);
    const service = new CalidadService(source.getRepository(ResultadoConforme), source);
    await expect(service.registrarConforme({ ordenId, cantidad: 1 }, 42)).rejects.toMatchObject({ status: 409 });
    expect(await service.consultarConformes(ordenId)).toEqual([]);
  });

  it('dos altas simultaneas no pueden exceder juntas lo producido', async () => {
    const ordenId = await prepararOrden([10]);
    const service = new CalidadService(source.getRepository(ResultadoConforme), source);
    const results = await Promise.allSettled([
      service.registrarConforme({ ordenId, cantidad: 6 }, 42),
      service.registrarConforme({ ordenId, cantidad: 6 }, 43),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const fallo = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(fallo.reason.getStatus()).toBe(409);
    const guardados = await service.consultarConformes(ordenId);
    expect(guardados).toHaveLength(1);
    expect(guardados[0].cantidad).toBe('6.0000');
  });

  it('compara decimales exactamente y no incluye avances de otra orden', async () => {
    const ordenId = await prepararOrden([0.1, 0.2]);
    await prepararOrden([100]);
    const service = new CalidadService(source.getRepository(ResultadoConforme), source);
    await service.registrarConforme({ ordenId, cantidad: 0.1 }, 42);
    await service.registrarConforme({ ordenId, cantidad: 0.2 }, 42);
    await expect(service.registrarConforme({ ordenId, cantidad: 0.0001 }, 42)).rejects.toMatchObject({ status: 409 });
    expect(await service.consultarConformes(ordenId)).toHaveLength(2);
  });
});
