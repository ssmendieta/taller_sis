import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { ProduccionSchema1710000000002 } from '../database/migrations/1710000000002-ProduccionSchema';
import { OrdenesCodigoSecuencia1710000000007 } from '../database/migrations/1710000000007-OrdenesCodigoSecuencia';
import { ResultadosConformes1710000000014 } from '../database/migrations/1710000000014-ResultadosConformes';
import { TipoResultadoCalidad1710000000015 } from '../database/migrations/1710000000015-TipoResultadoCalidad';
import { Lotes1710000000016 } from '../database/migrations/1710000000016-Lotes';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { TipoResultadoCalidad } from '../calidad/entities/tipo-resultado-calidad.enum';
import { CalidadService } from '../calidad/calidad.service';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Lote } from './entities/lote.entity';
import { LotesService } from './lotes.service';

describe('ABC-294: modelo de lote', () => {
  it('registra orden, cantidad conforme, codigo unico, responsable y fecha automatica', async () => {
    const source = new DataSource({ type: 'postgres', entities: [Lote, OrdenProduccion] });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    const metadata = source.getMetadata(Lote);
    expect(metadata.uniques.map((unique) => unique.name)).toContain('uq_lotes_codigo');
    expect(metadata.findColumnWithPropertyName('cantidad')).toMatchObject({ type: 'numeric', precision: 14, scale: 4 });
    expect(metadata.findColumnWithPropertyName('fechaHora')).toMatchObject({ type: 'timestamptz', isCreateDate: true });
    expect(metadata.foreignKeys[0]).toMatchObject({ name: 'fk_lote_orden', onDelete: 'RESTRICT' });
    expect(metadata.checks.map((check) => check.name)).toEqual(expect.arrayContaining(['ck_lote_codigo', 'ck_lote_cantidad', 'ck_lote_responsable']));
  });
});

const describeReal = process.env.LOTES_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-294: persistencia y asignacion atomica de lotes', () => {
  const schema = `abc294_test_${process.pid}_${Date.now()}`;
  let source: DataSource;
  let service: LotesService;
  let schemaCreado = false;
  let secuencia = 0;

  beforeAll(async () => {
    source = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), schema,
      entities: [Lote, OrdenProduccion, ResultadoConforme, AvancesProduccion], migrations: [] });
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
      await new Lotes1710000000016().up(runner);
      await runner.query("INSERT INTO recetas (producto_codigo,producto_nombre) VALUES ('R1','Producto')");
      await runner.commitTransaction();
      schemaCreado = true;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    service = new LotesService(source);
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

  async function prepararOrden(conformes = [10, 13], defectos = 5) {
    const [orden] = await source.query(`INSERT INTO "${schema}".ordenes_produccion
      (codigo,receta_id,cantidad_solicitada,fecha_programada,responsable_usuario_id)
      VALUES ($1,1,100,CURRENT_DATE,42) RETURNING id::text AS id`, [`O-L-${++secuencia}`]);
    await source.getRepository(AvancesProduccion).save({ orden_id: orden.id, cantidad_producida: 100, usuario_responsable_id: '42' });
    const calidad = new CalidadService(source.getRepository(ResultadoConforme), source);
    for (const cantidad of conformes) await calidad.registrarConforme({ ordenId: Number(orden.id), cantidad }, 42);
    if (defectos) await calidad.registrarResultado({ ordenId: Number(orden.id), cantidad: defectos,
      tipo: TipoResultadoCalidad.DEFECTUOSO, causaDefecto: 'Sellado incompleto' }, 43);
    return Number(orden.id);
  }

  it('asigna 23 conformes de registros 10+13 y persiste responsable y fecha tras reconectar', async () => {
    const ordenId = await prepararOrden();
    const resultados = await source.getRepository(ResultadoConforme).find({ where: { ordenId: String(ordenId) }, order: { id: 'ASC' } });
    const lote = await service.create({ ordenId, codigo: 'L-PERSIST', cantidad: 23 }, 42);
    await source.destroy();
    await source.initialize();
    const guardado = await source.getRepository(Lote).findOneOrFail({ where: { id: lote.id }, relations: { orden: true } });
    expect(guardado).toMatchObject({ codigo: 'L-PERSIST', ordenId: String(ordenId), cantidad: '23.0000', responsableUsuarioId: '42' });
    expect(guardado.fechaHora.getTime()).toBe(lote.fechaHora.getTime());
    expect(Number.isNaN(guardado.fechaHora.getTime())).toBe(false);
    expect(String(guardado.orden.id)).toBe(String(ordenId));
    expect(await source.getRepository(ResultadoConforme).find({ where: { ordenId: String(ordenId) }, order: { id: 'ASC' } })).toEqual(resultados);
  });

  it('409: codigo repetido en otra orden no crea registros parciales', async () => {
    const ordenId = await prepararOrden();
    const otraOrden = await prepararOrden();
    await service.create({ ordenId, codigo: 'L-DUP', cantidad: 10 }, 42);
    const anteriores = await source.getRepository(Lote).find({ order: { id: 'ASC' } });
    await expect(service.create({ ordenId: otraOrden, codigo: 'L-DUP', cantidad: 1 }, 43)).rejects.toMatchObject({ status: 409 });
    expect(await source.getRepository(Lote).find({ order: { id: 'ASC' } })).toEqual(anteriores);
    expect(await source.getRepository(Lote).countBy({ ordenId: String(otraOrden) })).toBe(0);
  });

  it('409: tras asignar 10 de 23 rechaza 14 y conserva los 13 sin asignar', async () => {
    const ordenId = await prepararOrden();
    await service.create({ ordenId, codigo: 'L-PARCIAL', cantidad: 10 }, 42);
    const repository = source.getRepository(Lote);
    const anteriores = await repository.find({ where: { ordenId: String(ordenId) } });
    await expect(service.create({ ordenId, codigo: 'L-EXCESO', cantidad: 14 }, 43)).rejects.toMatchObject({ status: 409 });
    expect(await repository.find({ where: { ordenId: String(ordenId) } })).toEqual(anteriores);
    expect(await repository.countBy({ codigo: 'L-EXCESO' })).toBe(0);
    await service.create({ ordenId, codigo: 'L-RESTO', cantidad: 13 }, 43);
    expect(await repository.countBy({ ordenId: String(ordenId) })).toBe(2);
  });

  it('409: no incluye los defectos ni conformes de otras ordenes en la disponibilidad', async () => {
    const ordenId = await prepararOrden();
    await prepararOrden([95], 5);
    await expect(service.create({ ordenId, codigo: 'L-NO-DEFECTOS', cantidad: 24 }, 42)).rejects.toMatchObject({ status: 409 });
    expect(await source.getRepository(Lote).countBy({ ordenId: String(ordenId) })).toBe(0);
  });

  it('409: una orden sin conformes no admite lote', async () => {
    const ordenId = await prepararOrden([], 5);
    await expect(service.create({ ordenId, codigo: 'L-SIN-CONFORMES', cantidad: 1 }, 42)).rejects.toMatchObject({ status: 409 });
    expect(await source.getRepository(Lote).countBy({ ordenId: String(ordenId) })).toBe(0);
  });

  it('serializa asignaciones simultaneas y rechaza el exceso sin insertar el segundo lote', async () => {
    const ordenId = await prepararOrden([23]);
    const results = await Promise.allSettled([
      service.create({ ordenId, codigo: 'L-SIMULTANEO-A', cantidad: 14 }, 42),
      service.create({ ordenId, codigo: 'L-SIMULTANEO-B', cantidad: 14 }, 43),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const fallo = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(fallo.reason.getStatus()).toBe(409);
    const lotes = await source.getRepository(Lote).findBy({ ordenId: String(ordenId) });
    expect(lotes).toHaveLength(1);
    expect(lotes[0].cantidad).toBe('14.0000');
  });

  it('la unicidad en BD protege el codigo simultaneo en ordenes distintas y devuelve 409', async () => {
    const a = await prepararOrden();
    const b = await prepararOrden();
    const results = await Promise.allSettled([
      service.create({ ordenId: a, codigo: 'L-SIMULTANEO-DUP', cantidad: 1 }, 42),
      service.create({ ordenId: b, codigo: 'L-SIMULTANEO-DUP', cantidad: 1 }, 43),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const fallo = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(fallo.reason.getStatus()).toBe(409);
    expect(await source.getRepository(Lote).countBy({ codigo: 'L-SIMULTANEO-DUP' })).toBe(1);
  });

  it.each([
    ['L-DB-0', '0', '42', '23514'],
    ['L-DB-NEG', '-1', '42', '23514'],
    ['L-DB-NAN', 'NaN', '42', '23514'],
    ['', '1', '42', '23514'],
    ['   ', '1', '42', '23514'],
    [' L-ESPACIO ', '1', '42', '23514'],
    ['L-DB-RESP', '1', '0', '23514'],
  ])('BD rechaza codigo=%s cantidad=%s responsable=%s sin guardar', async (codigo, cantidad, responsable, code) => {
    const ordenId = await prepararOrden();
    await expect(source.query(`INSERT INTO "${schema}".lotes
      (codigo,orden_id,cantidad,responsable_usuario_id) VALUES ($1,$2,$3,$4)`, [codigo, ordenId, cantidad, responsable]))
      .rejects.toMatchObject({ driverError: { code } });
    expect(await source.getRepository(Lote).countBy({ ordenId: String(ordenId) })).toBe(0);
  });

  it('BD rechaza la orden inexistente y el codigo duplicado incluso sin usar el servicio', async () => {
    await expect(source.query(`INSERT INTO "${schema}".lotes
      (codigo,orden_id,cantidad,responsable_usuario_id) VALUES ('L-DB-SIN-ORDEN',999999,1,42)`))
      .rejects.toMatchObject({ driverError: { code: '23503' } });
    const ordenId = await prepararOrden();
    await service.create({ ordenId, codigo: 'L-DB-DUP', cantidad: 1 }, 42);
    await expect(source.query(`INSERT INTO "${schema}".lotes
      (codigo,orden_id,cantidad,responsable_usuario_id) VALUES ('L-DB-DUP',$1,1,42)`, [ordenId]))
      .rejects.toMatchObject({ driverError: { code: '23505', constraint: 'uq_lotes_codigo' } });
    expect(await source.getRepository(Lote).countBy({ codigo: 'L-DB-DUP' })).toBe(1);
  });

  it('revierte y reaplica la migracion en el esquema aislado', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      const migration = new Lotes1710000000016();
      await migration.down(runner);
      expect((await runner.query("SELECT to_regclass('lotes') AS tabla"))[0].tabla).toBeNull();
      await migration.up(runner);
      expect((await runner.query('SELECT COUNT(*)::int AS total FROM lotes'))[0].total).toBe(0);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
