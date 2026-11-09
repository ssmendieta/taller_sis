import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { TipoResultadoCalidad } from '../calidad/entities/tipo-resultado-calidad.enum';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { ResultadosConformes1710000000014 } from '../database/migrations/1710000000014-ResultadosConformes';
import { TipoResultadoCalidad1710000000015 } from '../database/migrations/1710000000015-TipoResultadoCalidad';
import { Reprocesos1710000000027 } from '../database/migrations/1710000000027-Reprocesos';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Reproceso } from './entities/reproceso.entity';
import { ReprocesosService } from './reprocesos.service';

describe('ABC-395: entidad y migracion de reprocesos', () => {
  it('modela cantidades, autor, fecha y relaciones con orden y calidad', async () => {
    const source = new DataSource({
      type: 'postgres',
      entities: [Reproceso, ResultadoConforme, OrdenProduccion],
    });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    const metadata = source.getMetadata(Reproceso);
    expect(metadata.tableName).toBe('reprocesos');
    expect(metadata.findColumnWithPropertyName('cantidadProcesada')).toMatchObject({ precision: 14, scale: 4 });
    expect(metadata.findColumnWithPropertyName('cantidadRecuperada')).toMatchObject({ precision: 14, scale: 4 });
    expect(metadata.findColumnWithPropertyName('cantidadDescartada')).toMatchObject({ precision: 14, scale: 4 });
    expect(metadata.findColumnWithPropertyName('autorUsuarioId')).toBeDefined();
    expect(metadata.findColumnWithPropertyName('fechaHora')).toBeDefined();
    expect(metadata.relations.map((relation) => relation.propertyName)).toEqual(
      expect.arrayContaining(['orden', 'resultadoCalidad']),
    );
    expect(metadata.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'ck_reproceso_cantidades_no_negativas',
        'ck_reproceso_balance_cantidades',
        'ck_reproceso_autor',
      ]),
    );
  });

  it('crea restricciones y valida que el resultado sea defectuoso y de la misma orden', async () => {
    const sentencias: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        sentencias.push(sql);
      }),
    } as unknown as QueryRunner;

    await new Reprocesos1710000000027().up(runner);

    const sql = sentencias.join('\n');
    expect(sql).toContain('ck_reproceso_cantidades_no_negativas');
    expect(sql).toContain('cantidad_recuperada + cantidad_descartada = cantidad_procesada');
    expect(sql).toContain("resultado_tipo <> 'DEFECTUOSO'");
    expect(sql).toContain('resultado_orden_id <> NEW.orden_id');
    expect(sql).toContain('tr_reproceso_resultado_calidad');
  });
});

const describeReal = process.env.REPROCESOS_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-395: persistencia real de reprocesos', () => {
  const schema = `abc395_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let schemaCreado = false;

  beforeAll(async () => {
    source = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      entities: [Reproceso, ResultadoConforme, OrdenProduccion, AvancesProduccion],
      migrations: [],
    });
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
      await new Reprocesos1710000000027().up(runner);
      // El trigger busca su tabla de calidad en el esquema de esta prueba.
      await runner.query(`ALTER FUNCTION "${schema}".validar_reproceso_resultado_calidad()
        SET search_path TO "${schema}"`);
      await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
      await runner.query(`
        INSERT INTO ordenes_produccion
          (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id)
        VALUES ('O1',1,100,CURRENT_DATE,42), ('O2',1,50,CURRENT_DATE,42)
      `);
      await runner.query(`
        INSERT INTO avances_produccion (orden_id,cantidad_producida,usuario_responsable_id)
        VALUES (1,100,42)
      `);
      await runner.query(`
        INSERT INTO resultados_conformes
          (orden_id,cantidad,tipo,causa_defecto,responsable_usuario_id)
        VALUES
          (1,10,'DEFECTUOSO','Sellado incompleto',42),
          (1,90,'CONFORME',NULL,42),
          (2,5,'DEFECTUOSO','Empaque dañado',42)
      `);
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

  it('persiste el historial sin crear nuevas unidades producidas', async () => {
    const avancesAntes = await source.getRepository(AvancesProduccion).find();
    const reproceso = await source.getRepository(Reproceso).save({
      ordenId: '1',
      resultadoCalidadId: '1',
      cantidadProcesada: '10.0000',
      cantidadRecuperada: '8.0000',
      cantidadDescartada: '2.0000',
      autorUsuarioId: '43',
    });

    await source.destroy();
    await source.initialize();

    const guardado = await source.getRepository(Reproceso).findOneOrFail({
      where: { id: reproceso.id },
      relations: { orden: true, resultadoCalidad: true },
    });
    expect(guardado).toMatchObject({
      ordenId: '1',
      resultadoCalidadId: '1',
      cantidadProcesada: '10.0000',
      cantidadRecuperada: '8.0000',
      cantidadDescartada: '2.0000',
      autorUsuarioId: '43',
    });
    expect(guardado.fechaHora).toBeInstanceOf(Date);
    expect(guardado.orden.codigo).toBe('O1');
    expect(guardado.resultadoCalidad.tipo).toBe(TipoResultadoCalidad.DEFECTUOSO);
    expect(await source.getRepository(AvancesProduccion).find()).toEqual(avancesAntes);
  });

  it('ABC-396: serializa reprocesos concurrentes y conserva el resultado de calidad original', async () => {
    const servicio = new ReprocesosService(source);
    const dto = {
      resultadoCalidadId: '3', cantidadProcesada: 3, cantidadRecuperada: 2, cantidadDescartada: 1,
    };
    const resultados = await Promise.allSettled([
      servicio.registrar(2, dto, 43),
      servicio.registrar(2, dto, 44),
    ]);
    const registrados = resultados.filter((resultado) => resultado.status === 'fulfilled');
    expect(registrados).toHaveLength(1);
    expect(resultados.find((resultado) => resultado.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
    const { items, totales } = await servicio.consultar(2);
    expect(items).toHaveLength(1);
    expect(totales).toEqual({
      conformes: '2.0000', defectuosas: '2.0000', procesadas: '3.0000',
      recuperadas: '2.0000', descartadas: '1.0000',
    });
    expect(await source.getRepository(ResultadoConforme).findOneByOrFail({ id: '3' }))
      .toMatchObject({ cantidad: '5.0000', tipo: TipoResultadoCalidad.DEFECTUOSO });
  });

  it.each([
    ['1', '1', '-1', '0', '-1', '23514'],
    ['1', '1', '10', '7', '2', '23514'],
    ['1', '2', '90', '90', '0', '23514'],
    ['1', '3', '5', '5', '0', '23514'],
  ])(
    'rechaza orden=%s resultado=%s procesada=%s recuperada=%s descartada=%s',
    async (ordenId, resultadoCalidadId, procesada, recuperada, descartada, code) => {
      await expect(
        source.query(
          `INSERT INTO "${schema}".reprocesos
            (orden_id,resultado_calidad_id,cantidad_procesada,cantidad_recuperada,cantidad_descartada,autor_usuario_id)
           VALUES ($1,$2,$3,$4,$5,43)`,
          [ordenId, resultadoCalidadId, procesada, recuperada, descartada],
        ),
      ).rejects.toMatchObject({ driverError: { code } });
    },
  );
});
