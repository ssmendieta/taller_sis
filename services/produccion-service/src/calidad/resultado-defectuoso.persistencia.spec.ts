import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { ResultadosConformes1710000000014 } from '../database/migrations/1710000000014-ResultadosConformes';
import { TipoResultadoCalidad1710000000015 } from '../database/migrations/1710000000015-TipoResultadoCalidad';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { ResultadoConforme } from './entities/resultado-conforme.entity';
import { TipoResultadoCalidad } from './entities/tipo-resultado-calidad.enum';
import { CalidadService } from './calidad.service';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { ConsumoMaterial } from '../consumos-material/entities/consumo-material.entity';
import { Material } from '../materiales/entities/material.entity';
import { ConsumosMaterial1710000000013 } from '../database/migrations/1710000000013-ConsumosMaterial';

describe('ABC-83: clasificacion de calidad', () => {
  it('registra tipo por defecto, causa nullable y restricciones', async () => {
    const source = new DataSource({ type: 'postgres', entities: [ResultadoConforme, OrdenProduccion] });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(ResultadoConforme);
    expect(metadata.findColumnWithPropertyName('tipo')).toMatchObject({ default: 'CONFORME', isNullable: false });
    expect(metadata.findColumnWithPropertyName('causaDefecto')).toMatchObject({ length: '500', isNullable: true });
    expect(metadata.checks.map((check) => check.name)).toContain('ck_resultado_calidad_causa');
  });
});

const describeReal = process.env.CALIDAD_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-83: persistencia de defectos separados de conformes', () => {
  const schema = `abc83_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let schemaCreado = false;

  beforeAll(async () => {
    source = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), schema,
      entities: [ResultadoConforme, OrdenProduccion, AvancesProduccion, ConsumoMaterial, Material], migrations: [] });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new ProduccionSchema1710000000002().up(runner);
      await new OrdenesCodigoSecuencia1710000000007().up(runner);
      await new ConsumosMaterial1710000000013().up(runner);
      await new ResultadosConformes1710000000014().up(runner);
      await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
      await runner.query("INSERT INTO materiales (codigo,nombre,unidad_medida) VALUES ('M1','Material','kg')");
      await runner.query("INSERT INTO ordenes_produccion (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id) VALUES ('O1',1,100,CURRENT_DATE,42)");
      await runner.query("INSERT INTO avances_produccion (orden_id,cantidad_producida,usuario_responsable_id) VALUES (1,100,42)");
      await runner.query("INSERT INTO resultados_conformes (orden_id,cantidad,responsable_usuario_id) VALUES (1,95,42)");
      await new TipoResultadoCalidad1710000000015().up(runner);
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

  it('conserva los datos anteriores como conformes', async () => {
    const historico = await source.getRepository(ResultadoConforme).findOneByOrFail({ id: '1' });
    expect(historico).toMatchObject({ cantidad: '95.0000', tipo: 'CONFORME', causaDefecto: null, responsableUsuarioId: '42' });
  });

  it('persiste 95 conformes y 5 defectuosas y los consulta separados tras reconectar', async () => {
    const defecto = await source.getRepository(ResultadoConforme).save({
      ordenId: '1', cantidad: '5.0000', responsableUsuarioId: '43',
      tipo: TipoResultadoCalidad.DEFECTUOSO, causaDefecto: 'Sellado incompleto',
    });
    await source.destroy();
    await source.initialize();
    const repository = source.getRepository(ResultadoConforme);
    const defectos = await repository.find({ where: { ordenId: '1', tipo: TipoResultadoCalidad.DEFECTUOSO }, relations: { orden: true } });
    const service = new CalidadService(repository, source);
    const conformes = await service.consultarConformes(1);
    expect(conformes).toHaveLength(1);
    expect(conformes[0].cantidad).toBe('95.0000');
    expect(defectos).toHaveLength(1);
    expect(defectos[0]).toMatchObject({ id: defecto.id, cantidad: '5.0000', tipo: 'DEFECTUOSO', causaDefecto: 'Sellado incompleto', responsableUsuarioId: '43' });
    expect(defectos[0].fechaHora.getTime()).toBe(defecto.fechaHora.getTime());
    expect(defectos[0].orden.codigo).toBe('O1');
  });

  it.each([
    ['DEFECTUOSO', null, '1', '1', '23514'],
    ['DEFECTUOSO', '', '1', '1', '23514'],
    ['DEFECTUOSO', '   ', '1', '1', '23514'],
    ['CONFORME', 'No corresponde', '1', '1', '23514'],
    ['OTRO', null, '1', '1', '23514'],
    [null, null, '1', '1', '23502'],
    ['DEFECTUOSO', 'Causa', '0', '1', '23514'],
    ['DEFECTUOSO', 'Causa', '-1', '1', '23514'],
    ['DEFECTUOSO', 'Causa', 'NaN', '1', '23514'],
    ['DEFECTUOSO', 'Causa', '1', '999', '23503'],
  ])('rechaza tipo=%s causa=%s cantidad=%s orden=%s', async (tipo, causa, cantidad, orden, code) => {
    await expect(source.query(`INSERT INTO "${schema}".resultados_conformes
      (tipo,causa_defecto,cantidad,orden_id,responsable_usuario_id) VALUES ($1,$2,$3,$4,42)`, [tipo, causa, cantidad, orden]))
      .rejects.toMatchObject({ driverError: { code } });
  });

  it('no permite revertir la clasificacion mientras existan defectos', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await expect(new TipoResultadoCalidad1710000000015().down(runner)).rejects.toThrow('mientras existan resultados defectuosos');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect(await source.getRepository(ResultadoConforme).count()).toBe(2);
  });

  it('revierte y reaplica la ampliacion si solo hay conformes', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await runner.query("DELETE FROM resultados_conformes WHERE tipo = 'DEFECTUOSO'");
      const migration = new TipoResultadoCalidad1710000000015();
      await migration.down(runner);
      const [dato] = await runner.query('SELECT cantidad::text AS cantidad FROM resultados_conformes WHERE id = 1');
      expect(dato.cantidad).toBe('95.0000');
      await migration.up(runner);
      const restaurado = await runner.manager.findOneByOrFail(ResultadoConforme, { id: '1' });
      expect(restaurado.tipo).toBe(TipoResultadoCalidad.CONFORME);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  async function prepararOrden(producido = 100, conforme = 95) {
    const [orden] = await source.query(`INSERT INTO "${schema}".ordenes_produccion
      (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id)
      VALUES ($1,1,100,CURRENT_DATE,42) RETURNING id::text AS id`, [`O-${Date.now()}-${Math.random()}`]);
    await source.getRepository(AvancesProduccion).save({ orden_id: orden.id, cantidad_producida: producido, usuario_responsable_id: '42' });
    const service = new CalidadService(source.getRepository(ResultadoConforme), source);
    await service.registrarConforme({ ordenId: Number(orden.id), cantidad: conforme }, 42);
    await source.getRepository(ConsumoMaterial).save({ ordenId: orden.id, materialId: '1', cantidad: '17.5000', unidad: 'kg', usuarioRegistroId: '42' });
    return { ordenId: Number(orden.id), service };
  }

  it('registra 95+5, conserva consumos y consulta defectos tras reconectar', async () => {
    const { ordenId, service } = await prepararOrden();
    const consumos = await source.getRepository(ConsumoMaterial).find();
    await service.registrarResultado({ ordenId, cantidad: 5, tipo: TipoResultadoCalidad.DEFECTUOSO, causaDefecto: 'Sellado incompleto' }, 43);
    await source.destroy();
    await source.initialize();
    const defects = await service.consultarResultados(ordenId, TipoResultadoCalidad.DEFECTUOSO);
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ cantidad: '5.0000', causaDefecto: 'Sellado incompleto', responsableUsuarioId: '43' });
    expect((await service.consultarConformes(ordenId))[0].cantidad).toBe('95.0000');
    expect(await source.getRepository(ConsumoMaterial).find()).toEqual(consumos);
  });

  it('rechaza causa vacia y exceso 95+6 sin alterar calidad ni consumos', async () => {
    const { ordenId, service } = await prepararOrden();
    const repository = source.getRepository(ResultadoConforme);
    const anteriores = await repository.find({ where: { ordenId: String(ordenId) } });
    const consumos = await source.getRepository(ConsumoMaterial).find();
    await expect(service.registrarResultado({ ordenId, cantidad: 5, tipo: TipoResultadoCalidad.DEFECTUOSO, causaDefecto: '   ' }, 43))
      .rejects.toMatchObject({ status: 400 });
    await expect(service.registrarResultado({ ordenId, cantidad: 6, tipo: TipoResultadoCalidad.DEFECTUOSO, causaDefecto: 'Sellado' }, 43))
      .rejects.toMatchObject({ status: 409 });
    expect(await repository.find({ where: { ordenId: String(ordenId) } })).toEqual(anteriores);
    expect(await source.getRepository(ConsumoMaterial).find()).toEqual(consumos);
  });

  it('incluye defectos previos y aplica el limite tambien al registrar conformes', async () => {
    const { ordenId, service } = await prepararOrden();
    await service.registrarResultado({ ordenId, cantidad: 3, tipo: TipoResultadoCalidad.DEFECTUOSO, causaDefecto: 'Sellado' }, 43);
    await expect(service.registrarResultado({ ordenId, cantidad: 3, tipo: TipoResultadoCalidad.DEFECTUOSO, causaDefecto: 'Otro defecto' }, 43))
      .rejects.toMatchObject({ status: 409 });
    await service.registrarConforme({ ordenId, cantidad: 2 }, 42);
    await expect(service.registrarConforme({ ordenId, cantidad: 1 }, 42)).rejects.toMatchObject({ status: 409 });
    expect(await source.getRepository(ResultadoConforme).countBy({ ordenId: String(ordenId) })).toBe(3);
  });

  it('serializa conformes y defectos simultaneos y mantiene los consumos', async () => {
    const { ordenId, service } = await prepararOrden();
    const consumos = await source.getRepository(ConsumoMaterial).find();
    const results = await Promise.allSettled([
      service.registrarConforme({ ordenId, cantidad: 4 }, 42),
      service.registrarResultado({ ordenId, cantidad: 4, tipo: TipoResultadoCalidad.DEFECTUOSO, causaDefecto: 'Sellado' }, 43),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const fallo = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(fallo.reason.getStatus()).toBe(409);
    expect(await source.getRepository(ResultadoConforme).countBy({ ordenId: String(ordenId) })).toBe(2);
    expect(await source.getRepository(ConsumoMaterial).find()).toEqual(consumos);
  });
});
