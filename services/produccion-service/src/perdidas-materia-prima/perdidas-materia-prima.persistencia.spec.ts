import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { ResultadosConformes1710000000014 } from '../database/migrations/1710000000014-ResultadosConformes';
import { TipoResultadoCalidad1710000000015 } from '../database/migrations/1710000000015-TipoResultadoCalidad';
import { PerdidasMateriaPrima1710000000023 } from '../database/migrations/1710000000023-PerdidasMateriaPrima';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { PerdidaMateriaPrima } from './entities/perdida-materia-prima.entity';

const entities = [PerdidaMateriaPrima, OrdenProduccion, Material, ResultadoConforme];

async function sqlDe(paso: 'up' | 'down'): Promise<string> {
  const query = jest.fn(async (_sql: string) => undefined);
  await new PerdidasMateriaPrima1710000000023()[paso]({ query } as unknown as QueryRunner);
  return query.mock.calls.map(([sql]) => String(sql)).join('\n');
}

describe('ABC-74: modelo de pérdida de materia prima', () => {
  it('registra orden, material, cantidad decimal, unidad, motivo, autor y fecha del servidor', async () => {
    const source = new DataSource({ type: 'postgres', entities });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(PerdidaMateriaPrima);

    expect(metadata.tableName).toBe('perdidas_materia_prima');
    expect(metadata.findRelationWithPropertyPath('orden')).toMatchObject({ onDelete: 'RESTRICT' });
    expect(metadata.findRelationWithPropertyPath('orden')?.inverseEntityMetadata.target).toBe(OrdenProduccion);
    expect(metadata.findRelationWithPropertyPath('material')).toMatchObject({ onDelete: 'RESTRICT' });
    expect(metadata.findRelationWithPropertyPath('material')?.inverseEntityMetadata.target).toBe(Material);
    expect(metadata.findColumnWithPropertyName('cantidad')).toMatchObject({ type: 'numeric', precision: 14, scale: 4, isNullable: false });
    expect(metadata.findColumnWithPropertyName('unidad')).toMatchObject({ length: '40', isNullable: false });
    expect(metadata.findColumnWithPropertyName('motivo')).toMatchObject({ length: '500', isNullable: false });
    expect(metadata.findColumnWithPropertyName('autorUsuarioId')).toMatchObject({ databaseName: 'autor_usuario_id', isNullable: false });
    expect(metadata.findColumnWithPropertyName('fechaHora')).toMatchObject({ type: 'timestamptz', isCreateDate: true });
    expect(metadata.checks.map((check) => check.name).sort()).toEqual([
      'ck_perdida_mp_autor', 'ck_perdida_mp_cantidad', 'ck_perdida_mp_motivo', 'ck_perdida_mp_unidad',
    ]);
  });

  it('es una tabla propia, separada de los resultados conformes/defectuosos', async () => {
    const source = new DataSource({ type: 'postgres', entities });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    expect(source.getMetadata(PerdidaMateriaPrima).tableName).not.toBe(source.getMetadata(ResultadoConforme).tableName);
    expect(source.getMetadata(PerdidaMateriaPrima).relations.map((r) => r.inverseEntityMetadata.target))
      .not.toContain(ResultadoConforme);
  });

  it('la migración crea la tabla con restricciones dentro de la base de Producción y no toca calidad', async () => {
    const up = await sqlDe('up');
    expect(up).toContain('CREATE TABLE perdidas_materia_prima');
    expect(up).toMatch(/fk_perdida_mp_orden FOREIGN KEY \(orden_id\)\s+REFERENCES ordenes_produccion\(id\) ON DELETE RESTRICT/);
    expect(up).toMatch(/fk_perdida_mp_material FOREIGN KEY \(material_id\)\s+REFERENCES materiales\(id\) ON DELETE RESTRICT/);
    expect(up).toContain("CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric)");
    expect(up).toContain('CHECK (LENGTH(BTRIM(motivo)) > 0)');
    expect(up).toContain('CHECK (autor_usuario_id > 0)');
    expect(up).not.toMatch(/resultados_conformes|consumos_material|inventario/);
    expect(await sqlDe('down')).toBe('DROP TABLE perdidas_materia_prima;');
  });
});

// PERDIDAS_DB_REAL=1 habilita PostgreSQL real en un esquema exclusivo que se
// elimina al terminar; no aplica la migración a las tablas de la aplicación.
const describeReal = process.env.PERDIDAS_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-74: persistencia real de la pérdida de materia prima', () => {
  const schema = `abc74_test_${process.pid}_${Date.now()}`;
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
      await new TipoResultadoCalidad1710000000015().up(runner);
      await new PerdidasMateriaPrima1710000000023().up(runner);
      await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
      await runner.query("INSERT INTO materiales (codigo,nombre,unidad_medida) VALUES ('M1','Harina','kg')");
      await runner.query("INSERT INTO ordenes_produccion (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id) VALUES ('O1',1,100,CURRENT_DATE,42)");
      await runner.query(`INSERT INTO resultados_conformes (orden_id,cantidad,responsable_usuario_id,tipo,causa_defecto)
        VALUES (1,95,42,'CONFORME',NULL), (1,5,42,'DEFECTUOSO','Rotura')`);
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

  const resultadosCalidad = () => source.query(
    `SELECT id::text, orden_id::text, cantidad::text, tipo, causa_defecto, responsable_usuario_id::text, fecha_hora
     FROM "${schema}".resultados_conformes ORDER BY id`,
  );

  it('persiste la merma tras cerrar y reabrir la conexión, con autor y fecha del servidor', async () => {
    const guardada = await source.getRepository(PerdidaMateriaPrima).save({
      ordenId: '1', materialId: '1', cantidad: '2.1250', unidad: 'kg', motivo: 'Derrame en mezcladora', autorUsuarioId: '42',
    });
    await source.destroy();
    await source.initialize();

    const leida = await source.getRepository(PerdidaMateriaPrima).findOneOrFail({
      where: { id: guardada.id }, relations: { orden: true, material: true },
    });
    expect(leida).toMatchObject({
      ordenId: '1', materialId: '1', cantidad: '2.1250', unidad: 'kg', motivo: 'Derrame en mezcladora', autorUsuarioId: '42',
    });
    expect(leida.fechaHora).toBeInstanceOf(Date);
    expect(leida.fechaHora.getTime()).toBe(guardada.fechaHora.getTime());
    expect(leida.orden.codigo).toBe('O1');
    expect(leida.material.codigo).toBe('M1');
  });

  it('registrar mermas no modifica los resultados conformes ni defectuosos', async () => {
    const antes = await resultadosCalidad();
    await source.getRepository(PerdidaMateriaPrima).save([
      { ordenId: '1', materialId: '1', cantidad: '1.0000', unidad: 'kg', motivo: 'Vencido', autorUsuarioId: '42' },
      { ordenId: '1', materialId: '1', cantidad: '0.5000', unidad: 'kg', motivo: 'Contaminado', autorUsuarioId: '43' },
    ]);
    expect(await resultadosCalidad()).toEqual(antes);
    expect(antes.map((r: { tipo: string; cantidad: string }) => `${r.tipo} ${r.cantidad}`)).toEqual(['CONFORME 95.0000', 'DEFECTUOSO 5.0000']);
  });

  it.each([
    ['orden inexistente', "999,1,1,'kg','Rotura',42", '23503'],
    ['material inexistente', "1,999,1,'kg','Rotura',42", '23503'],
    ['cantidad cero', "1,1,0,'kg','Rotura',42", '23514'],
    ['cantidad negativa', "1,1,-1,'kg','Rotura',42", '23514'],
    ['cantidad NaN', "1,1,'NaN','kg','Rotura',42", '23514'],
    ['unidad fuera del catálogo', "1,1,1,'kilo','Rotura',42", '23514'],
    ['motivo vacío', "1,1,1,'kg','',42", '23514'],
    ['motivo con solo espacios', "1,1,1,'kg','   ',42", '23514'],
    ['motivo nulo', "1,1,1,'kg',NULL,42", '23502'],
    ['autor no positivo', "1,1,1,'kg','Rotura',0", '23514'],
  ])('rechaza %s (%s → %s)', async (_caso, valores, codigo) => {
    await expect(source.query(`INSERT INTO "${schema}".perdidas_materia_prima
      (orden_id,material_id,cantidad,unidad,motivo,autor_usuario_id) VALUES (${valores})`))
      .rejects.toMatchObject({ driverError: { code: codigo } });
  });

  it('no permite borrar la orden ni el material que tienen mermas', async () => {
    await expect(source.query(`DELETE FROM "${schema}".ordenes_produccion WHERE id = 1`))
      .rejects.toMatchObject({ driverError: { code: '23503' } });
    await expect(source.query(`DELETE FROM "${schema}".materiales WHERE id = 1`))
      .rejects.toMatchObject({ driverError: { code: '23503' } });
  });

  it('la migración se revierte y se reaplica sin tocar la calidad', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      const migracion = new PerdidasMateriaPrima1710000000023();
      await migracion.down(runner);
      expect((await runner.query("SELECT to_regclass('perdidas_materia_prima') AS tabla"))[0].tabla).toBeNull();
      expect((await runner.query('SELECT COUNT(*)::int AS total FROM resultados_conformes'))[0].total).toBe(2);
      await migracion.up(runner);
      expect((await runner.query("SELECT to_regclass('perdidas_materia_prima') AS tabla"))[0].tabla).not.toBeNull();
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
