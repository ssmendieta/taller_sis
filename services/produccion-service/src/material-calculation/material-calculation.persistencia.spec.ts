import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { InventarioMaterial1710000000004 } from '../database/migrations/1710000000004-InventarioMaterial';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { ConsumosMaterial1710000000013 } from '../database/migrations/1710000000013-ConsumosMaterial';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Receta } from '../recetas/entities/receta.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { Material } from '../materiales/entities/material.entity';
import { ConsumoMaterial } from '../consumos-material/entities/consumo-material.entity';
import { ConsumosMaterialService } from '../consumos-material/consumos-material.service';
import { MaterialCalculationService } from './material-calculation.service';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { OrdenesController } from '../ordenes/ordenes.controller';
import { OrdenesService } from '../ordenes/ordenes.service';

const describeReal = process.env.MATERIALES_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-72: requerido y consumo persistido por orden', () => {
  const schema = `abc72_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let service: MaterialCalculationService;
  let consumosService: ConsumosMaterialService;
  let app: INestApplication;
  let base: string;
  let permisos: string[];
  const httpFetch = global.fetch;
  let schemaCreado = false;

  beforeAll(async () => {
    source = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), schema,
      entities: [OrdenProduccion, Receta, RecetaMaterial, Material, ConsumoMaterial], migrations: [] });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new ProduccionSchema1710000000002().up(runner);
      await new InventarioMaterial1710000000004().up(runner);
      await new OrdenesCodigoSecuencia1710000000007().up(runner);
      await new ConsumosMaterial1710000000013().up(runner);
      await runner.query("INSERT INTO materiales (codigo,nombre,unidad_medida) VALUES ('M1','Harina','kg'), ('M2','Envase','unidad')");
      await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
      await runner.query("INSERT INTO receta_material (receta_id,material_id,cantidad_requerida) VALUES (1,1,10), (1,2,1)");
      await runner.query("INSERT INTO ordenes_produccion (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id) VALUES ('O1',1,2,CURRENT_DATE,42), ('O2',1,2,CURRENT_DATE,42)");
      await runner.query("INSERT INTO inventario_material (material_id,cantidad_disponible) VALUES (1,50), (2,30)");
      await runner.commitTransaction();
      schemaCreado = true;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    consumosService = new ConsumosMaterialService(source.getRepository(ConsumoMaterial), source);
    service = new MaterialCalculationService(source, consumosService);
    const module = await Test.createTestingModule({
      controllers: [OrdenesController],
      providers: [PermisoProduccionGuard,
        { provide: OrdenesService, useValue: {} },
        { provide: MaterialCalculationService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 30000);

  beforeEach(() => {
    permisos = ['ordenes.consultar'];
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Encargado de Produccion', permisos,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
  });

  afterEach(() => jest.restoreAllMocks());

  async function consultar(ordenId: number) {
    const response = await httpFetch(`${base}/ordenes/${ordenId}/comparacion-materiales`, {
      headers: { Authorization: 'Bearer prueba' },
    });
    return { status: response.status, body: await response.json() };
  }

  afterAll(async () => {
    await app?.close();
    if (source?.isInitialized) {
      try {
        if (schemaCreado) await source.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await source.destroy();
      }
    }
  });

  it('sin consumos requiere 20 kg, consume 0 kg y diferencia -20 kg', async () => {
    const response = await consultar(1);
    expect(response.status).toBe(200);
    const result = response.body;
    expect(result.materiales[0]).toMatchObject({ materialId: '1', cantidadRequerida: '20.0000', cantidadConsumida: '0.0000', diferencia: '-20.0000', unidad: 'kg' });
    expect(result.materiales[1]).toMatchObject({ cantidadRequerida: '2.0000', cantidadConsumida: '0.0000', diferencia: '-2.0000', unidad: 'unidad' });
  });

  it('suma registros ABC-71 de 10 y 13 kg y devuelve 23 kg con diferencia +3 kg', async () => {
    const inventario = await source.query(`SELECT * FROM "${schema}".inventario_material ORDER BY id`);
    await consumosService.create({ ordenId: 2, materialId: 1, cantidad: 10, unidad: 'kg' }, 42);
    await consumosService.create({ ordenId: 2, materialId: 1, cantidad: 13, unidad: 'kg' }, 43);
    // Un consumo de otra orden no debe entrar en el acumulado de O2.
    await consumosService.create({ ordenId: 1, materialId: 1, cantidad: 100, unidad: 'kg' }, 42);
    const anteriores = await source.getRepository(ConsumoMaterial).find({ order: { id: 'ASC' } });
    const response = await consultar(2);
    expect(response.status).toBe(200);
    const result = response.body;
    expect(result.materiales[0]).toMatchObject({ cantidadRequerida: '20.0000', cantidadConsumida: '23.0000', diferencia: '3.0000', unidad: 'kg' });
    expect(await source.getRepository(ConsumoMaterial).countBy({ ordenId: '2' })).toBe(2);
    expect(await source.getRepository(ConsumoMaterial).find({ order: { id: 'ASC' } })).toEqual(anteriores);
    expect(await source.query(`SELECT * FROM "${schema}".inventario_material ORDER BY id`)).toEqual(inventario);
  });

  it('rechaza comparar unidades distintas sin mezclarlas ni modificar registros', async () => {
    const repository = source.getRepository(ConsumoMaterial);
    const incompatible = await repository.save({ ordenId: '2', materialId: '1', cantidad: '5.0000', unidad: 'g', usuarioRegistroId: '42' });
    try {
      const anteriores = await repository.find({ order: { id: 'ASC' } });
      expect((await consultar(2)).status).toBe(409);
      expect(await repository.find({ order: { id: 'ASC' } })).toEqual(anteriores);
    } finally {
      await repository.delete(incompatible.id);
    }
  });

  it('404: orden inexistente', async () => {
    expect((await consultar(999)).status).toBe(404);
  });

  it('403: falta de permiso impide consultar y mantiene los datos', async () => {
    permisos = ['materiales.calcular'];
    const repository = source.getRepository(ConsumoMaterial);
    const anteriores = await repository.find({ order: { id: 'ASC' } });
    expect((await consultar(2)).status).toBe(403);
    expect(await repository.find({ order: { id: 'ASC' } })).toEqual(anteriores);
  });
});
