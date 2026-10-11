import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { SolicitudesMaterial1710000000012 } from '../database/migrations/1710000000012-SolicitudesMaterial';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { SolicitudMaterial } from './entities/solicitud-material.entity';
import { SolicitudMaterialItem } from './entities/solicitud-material-item.entity';

const entities = [Material, OrdenProduccion, SolicitudMaterial, SolicitudMaterialItem];

describe('SolicitudMaterial: metadatos TypeORM', () => {
  it('registra las relaciones, el estado inicial y la cantidad decimal', async () => {
    const source = new DataSource({ type: 'postgres', entities });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const solicitud = source.getMetadata(SolicitudMaterial);
    expect(solicitud.findColumnWithPropertyName('estado')?.default).toBe('PENDIENTE');
    expect(solicitud.findRelationWithPropertyPath('orden')?.inverseEntityMetadata.target).toBe(OrdenProduccion);
    expect(solicitud.findRelationWithPropertyPath('items')?.inverseEntityMetadata.target).toBe(SolicitudMaterialItem);
    const item = source.getMetadata(SolicitudMaterialItem);
    expect(item.findRelationWithPropertyPath('material')?.inverseEntityMetadata.target).toBe(Material);
    expect(item.findColumnWithPropertyName('cantidad')?.scale).toBe(4);
    expect(item.checks.some((check) => check.expression === 'cantidad > 0')).toBe(true);
  });
});

// Ejecutar con SOLICITUDES_DB_REAL=1. Todo ocurre en un esquema temporal
// dentro de una transaccion que se revierte, sin alterar datos existentes.
const describeReal = process.env.SOLICITUDES_DB_REAL === '1' ? describe : describe.skip;

describeReal('SolicitudMaterial: persistencia PostgreSQL', () => {
  let source: DataSource;
  let runner: QueryRunner;

  beforeAll(async () => {
    source = new DataSource({ ...AppDataSource.options, entities, migrations: [] });
    await source.initialize();
    runner = source.createQueryRunner();
    await runner.startTransaction();
    const schema = `abc73_test_${process.pid}_${Date.now()}`;
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET LOCAL search_path TO "${schema}"`);
    await new ProduccionSchema1710000000002().up(runner);
    await new OrdenesCodigoSecuencia1710000000007().up(runner);
    await new SolicitudesMaterial1710000000012().up(runner);
  }, 30000);

  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner) await runner.release();
    if (source?.isInitialized) await source.destroy();
  });

  async function rechaza(sql: string, code: string): Promise<void> {
    await runner.query('SAVEPOINT dato_invalido');
    try {
      await expect(runner.query(sql)).rejects.toMatchObject({ driverError: { code } });
    } finally {
      await runner.query('ROLLBACK TO SAVEPOINT dato_invalido');
      await runner.query('RELEASE SAVEPOINT dato_invalido');
    }
  }

  it('guarda y lee relaciones, rechaza datos invalidos y revierte la migracion', async () => {
    await runner.query("INSERT INTO materiales (codigo,nombre,unidad_medida) VALUES ('M1','Material','kg')");
    await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
    await runner.query("INSERT INTO ordenes_produccion (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id) VALUES ('O1',1,1,CURRENT_DATE,10)");
    const solicitud = await runner.manager.save(SolicitudMaterial, { ordenId: '1', solicitanteUsuarioId: '10' });
    expect(solicitud.estado).toBe('PENDIENTE');
    expect(solicitud.fecha).toBeInstanceOf(Date);
    await runner.manager.save(SolicitudMaterialItem, { solicitudId: solicitud.id, materialId: '1', cantidad: '2.1250', unidad: 'kg' });
    const leida = await runner.manager.findOneOrFail(SolicitudMaterial, {
      where: { id: solicitud.id }, relations: { orden: true, items: { material: true } },
    });
    expect(leida.orden.codigo).toBe('O1');
    expect(leida.items[0].material.codigo).toBe('M1');
    expect(leida.items[0].cantidad).toBe('2.1250');
    await rechaza("INSERT INTO solicitudes_material (orden_id,solicitante_usuario_id) VALUES (999,10)", '23503');
    await rechaza("INSERT INTO solicitud_material_items (solicitud_id,material_id,cantidad,unidad) VALUES (1,999,1,'kg')", '23503');
    await rechaza("INSERT INTO solicitud_material_items (solicitud_id,material_id,cantidad,unidad) VALUES (999,1,1,'kg')", '23503');
    for (const cantidad of ['0', '-1']) {
      await rechaza(`INSERT INTO solicitud_material_items (solicitud_id,material_id,cantidad,unidad) VALUES (1,1,${cantidad},'kg')`, '23514');
    }
    await rechaza("INSERT INTO solicitud_material_items (solicitud_id,material_id,cantidad,unidad) VALUES (1,1,1,'')", '23514');
    await rechaza('DELETE FROM ordenes_produccion WHERE id = 1', '23503');
    await rechaza('DELETE FROM materiales WHERE id = 1', '23503');
    await rechaza('DELETE FROM solicitudes_material WHERE id = 1', '23503');
    await new SolicitudesMaterial1710000000012().down(runner);
    const [tables] = await runner.query("SELECT to_regclass('solicitudes_material') AS solicitud, to_regclass('solicitud_material_items') AS items");
    expect(tables).toEqual({ solicitud: null, items: null });
    await new SolicitudesMaterial1710000000012().up(runner);
  });
});
