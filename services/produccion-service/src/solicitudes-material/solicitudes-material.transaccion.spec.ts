import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { SolicitudesMaterial1710000000012 } from '../database/migrations/1710000000012-SolicitudesMaterial';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { SolicitudMaterial } from './entities/solicitud-material.entity';
import { SolicitudMaterialItem } from './entities/solicitud-material-item.entity';
import { SolicitudesMaterialService } from './solicitudes-material.service';

const describeReal = process.env.SOLICITUDES_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-73: transacciones reales de solicitudes', () => {
  const schema = `abc73_service_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let service: SolicitudesMaterialService;
  let schemaCreado = false;
  const dto = { ordenId: 1, items: [{ materialId: 1, cantidad: 2, unidad: 'kg' }] };

  beforeAll(async () => {
    source = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), schema, migrations: [],
      entities: [SolicitudMaterial, SolicitudMaterialItem, OrdenProduccion, Material] });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new ProduccionSchema1710000000002().up(runner);
      await new OrdenesCodigoSecuencia1710000000007().up(runner);
      await new SolicitudesMaterial1710000000012().up(runner);
      await runner.query("INSERT INTO materiales (codigo,nombre,unidad_medida) VALUES ('M1','Material 1','kg'), ('M2','Material 2','kg')");
      await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
      await runner.query("INSERT INTO ordenes_produccion (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id) VALUES ('O1',1,1,CURRENT_DATE,42)");
      await runner.commitTransaction();
      schemaCreado = true;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    service = new SolicitudesMaterialService(source.getRepository(SolicitudMaterial), source);
  }, 30000);

  beforeEach(async () => {
    await source.query(`TRUNCATE "${schema}".solicitud_material_items, "${schema}".solicitudes_material RESTART IDENTITY`);
  });

  afterAll(async () => {
    if (source?.isInitialized) {
      try {
        if (schemaCreado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await source.destroy();
      }
    }
  });

  it('persiste varios items y permite leer listado y detalle', async () => {
    const solicitud = await service.create({ ...dto, items: [...dto.items, { materialId: 2, cantidad: 3.125, unidad: 'kg' }] }, 42);
    expect(solicitud.solicitanteUsuarioId).toBe('42');
    expect(solicitud.estado).toBe('PENDIENTE');
    const detalle = await service.findOne(solicitud.id);
    expect(detalle.items).toHaveLength(2);
    expect(detalle.items.map((item) => item.material.codigo).sort()).toEqual(['M1', 'M2']);
    expect(await service.findAll()).toHaveLength(1);
  });

  it('rechaza duplicados simultaneos con 409 y solo guarda una solicitud', async () => {
    const results = await Promise.allSettled([service.create(dto, 42), service.create(dto, 43)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const fallo = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(fallo.reason.getStatus()).toBe(409);
    expect(await source.getRepository(SolicitudMaterial).count()).toBe(1);
    expect(await source.getRepository(SolicitudMaterialItem).count()).toBe(1);
  });

  it('APROBADA bloquea duplicados, y una solicitud cerrada permite otra', async () => {
    const solicitud = await service.create(dto, 42);
    await source.getRepository(SolicitudMaterial).update(solicitud.id, { estado: 'APROBADA' });
    await expect(service.create(dto, 42)).rejects.toMatchObject({ status: 409 });
    await source.getRepository(SolicitudMaterial).update(solicitud.id, { estado: 'CANCELADA' });
    await expect(service.create(dto, 42)).resolves.toMatchObject({ estado: 'PENDIENTE' });
  });

  it('revierte cabecera y primer item cuando PostgreSQL rechaza otro item', async () => {
    // Fallo deliberado de persistencia despues de superar las validaciones.
    await source.query(`ALTER TABLE "${schema}".solicitud_material_items ADD CONSTRAINT fallo_prueba CHECK (cantidad <> 7)`);
    try {
      await expect(service.create({ ...dto, items: [...dto.items, { materialId: 2, cantidad: 7, unidad: 'kg' }] }, 42)).rejects.toMatchObject({ code: '23514' });
      expect(await source.getRepository(SolicitudMaterial).count()).toBe(0);
      expect(await source.getRepository(SolicitudMaterialItem).count()).toBe(0);
    } finally {
      await source.query(`ALTER TABLE "${schema}".solicitud_material_items DROP CONSTRAINT fallo_prueba`);
    }
  });
});
