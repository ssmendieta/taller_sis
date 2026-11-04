import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { ConsumosMaterial1710000000013 } from '../database/migrations/1710000000013-ConsumosMaterial';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { ConsumoMaterial } from './entities/consumo-material.entity';
import { Receta } from '../recetas/entities/receta.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { ConsumosMaterialService } from './consumos-material.service';

const entities = [ConsumoMaterial, OrdenProduccion, Material, Receta, RecetaMaterial];

describe('ABC-71: metadatos de ConsumoMaterial', () => {
  it('registra relaciones, campos obligatorios y precision decimal', async () => {
    const source = new DataSource({ type: 'postgres', entities });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(ConsumoMaterial);
    expect(metadata.findRelationWithPropertyPath('orden')?.inverseEntityMetadata.target).toBe(OrdenProduccion);
    expect(metadata.findRelationWithPropertyPath('material')?.inverseEntityMetadata.target).toBe(Material);
    expect(metadata.findColumnWithPropertyName('cantidad')).toMatchObject({ precision: 14, scale: 4, isNullable: false });
    expect(metadata.findColumnWithPropertyName('usuarioRegistroId')?.isNullable).toBe(false);
    expect(metadata.findColumnWithPropertyName('fechaHora')).toMatchObject({ type: 'timestamptz', isCreateDate: true });
  });
});

// CONSUMOS_DB_REAL=1 habilita PostgreSQL real. El esquema y todos sus datos
// se crean dentro de una transaccion que se revierte al terminar.
const describeReal = process.env.CONSUMOS_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-71: persistencia real de ConsumoMaterial', () => {
  let source: DataSource;
  let runner: QueryRunner;

  beforeAll(async () => {
    source = new DataSource({ ...AppDataSource.options, entities, migrations: [] });
    await source.initialize();
    runner = source.createQueryRunner();
    await runner.startTransaction();
    const schema = `abc71_test_${process.pid}_${Date.now()}`;
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET LOCAL search_path TO "${schema}"`);
    await new ProduccionSchema1710000000002().up(runner);
    await new OrdenesCodigoSecuencia1710000000007().up(runner);
    await new ConsumosMaterial1710000000013().up(runner);
    await runner.query("INSERT INTO materiales (codigo,nombre,unidad_medida) VALUES ('M1','Material','kg')");
    await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
    await runner.query("INSERT INTO ordenes_produccion (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id) VALUES ('O1',1,1,CURRENT_DATE,42)");
  }, 30000);

  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner) await runner.release();
    if (source?.isInitialized) await source.destroy();
  });

  it('guarda y recupera cantidad, unidad, usuario, fecha y relaciones', async () => {
    const consumo = await runner.manager.save(ConsumoMaterial, {
      ordenId: '1', materialId: '1', cantidad: '2.1250', unidad: 'kg', usuarioRegistroId: '42',
    });
    const leido = await runner.manager.findOneOrFail(ConsumoMaterial, {
      where: { id: consumo.id }, relations: { orden: true, material: true },
    });
    expect(leido).toMatchObject({ cantidad: '2.1250', unidad: 'kg', usuarioRegistroId: '42' });
    expect(leido.fechaHora).toBeInstanceOf(Date);
    expect(leido.orden.codigo).toBe('O1');
    expect(leido.material.codigo).toBe('M1');
  });

  it.each([
    ["INSERT INTO consumos_material (orden_id,material_id,cantidad,unidad,usuario_registro_id) VALUES (999,1,1,'kg',42)", '23503'],
    ["INSERT INTO consumos_material (orden_id,material_id,cantidad,unidad,usuario_registro_id) VALUES (1,999,1,'kg',42)", '23503'],
    ["INSERT INTO consumos_material (orden_id,material_id,cantidad,unidad,usuario_registro_id) VALUES (1,1,0,'kg',42)", '23514'],
    ["INSERT INTO consumos_material (orden_id,material_id,cantidad,unidad,usuario_registro_id) VALUES (1,1,-1,'kg',42)", '23514'],
    ["INSERT INTO consumos_material (orden_id,material_id,cantidad,unidad,usuario_registro_id) VALUES (1,1,'NaN','kg',42)", '23514'],
    ["INSERT INTO consumos_material (orden_id,material_id,cantidad,unidad,usuario_registro_id) VALUES (1,1,1,'',42)", '23514'],
    ["INSERT INTO consumos_material (orden_id,material_id,cantidad,unidad,usuario_registro_id) VALUES (1,1,1,'kg',0)", '23514'],
    ["INSERT INTO consumos_material (orden_id,material_id,cantidad,unidad) VALUES (1,1,1,'kg')", '23502'],
    ['DELETE FROM ordenes_produccion WHERE id = 1', '23503'],
    ['DELETE FROM materiales WHERE id = 1', '23503'],
  ])('rechaza datos invalidos o borrado de referencias: %s', async (sql, code) => {
    await runner.query('SAVEPOINT dato_invalido');
    try {
      await expect(runner.query(sql)).rejects.toMatchObject({ driverError: { code } });
    } finally {
      await runner.query('ROLLBACK TO SAVEPOINT dato_invalido');
      await runner.query('RELEASE SAVEPOINT dato_invalido');
    }
  });

  it('revierte y vuelve a aplicar la migracion sin borrar ordenes ni materiales', async () => {
    const migration = new ConsumosMaterial1710000000013();
    await migration.down(runner);
    const [tabla] = await runner.query("SELECT to_regclass('consumos_material') AS consumo");
    expect(tabla.consumo).toBeNull();
    expect(await runner.manager.count(OrdenProduccion)).toBe(1);
    expect(await runner.manager.count(Material)).toBe(1);
    await migration.up(runner);
    expect(await runner.manager.count(ConsumoMaterial)).toBe(0);
  });

  it('el servicio conserva 10 y 13 por separado y suma 23 por orden y material', async () => {
    await runner.query("INSERT INTO receta_material (receta_id,material_id,cantidad_requerida) VALUES (1,1,1)");
    // El servicio usa transacciones anidadas sobre la conexion aislada de prueba.
    const dataSource = {
      transaction: (callback) => runner.manager.transaction(callback),
      getRepository: (entity) => runner.manager.getRepository(entity),
    } as unknown as DataSource;
    const service = new ConsumosMaterialService(runner.manager.getRepository(ConsumoMaterial), dataSource);
    const dto = { ordenId: 1, materialId: 1, cantidad: 10, unidad: 'kg' };
    const primero = await service.create(dto, 42);
    const segundo = await service.create({ ...dto, cantidad: 13 }, 43);
    expect(primero.id).not.toBe(segundo.id);
    const consumos = await service.findByOrden(1, 1);
    expect(consumos.map((consumo) => consumo.cantidad)).toEqual(['10.0000', '13.0000']);
    expect(consumos.map((consumo) => consumo.usuarioRegistroId)).toEqual(['42', '43']);
    expect(await service.totales(1, 1)).toEqual([{ ordenId: '1', materialId: '1', unidad: 'kg', cantidadTotal: '23.0000' }]);
    await runner.query("INSERT INTO materiales (codigo,nombre,unidad_medida) VALUES ('M2','Otro material','kg')");
    await expect(service.create({ ...dto, materialId: 2 }, 42)).rejects.toMatchObject({ status: 400 });
    expect(await service.findByOrden(1, 2)).toEqual([]);
    expect(await service.totales(1, 2)).toEqual([]);
    expect(await service.findByOrden(1)).toHaveLength(2);
    expect(await service.totales(1)).toHaveLength(1);
  });
});
