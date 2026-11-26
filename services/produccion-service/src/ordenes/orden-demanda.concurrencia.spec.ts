import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { DemandaService } from '../demanda/demanda.service';
import { Demanda } from '../demanda/entities/demanda.entity';
import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';
import { OrdenesService } from './ordenes.service';

// ABC-446: con PostgreSQL real, dos pedidos simultáneos crean una sola orden y la
// demanda sale de planificables cuando todos sus productos tienen orden.
const describeReal = process.env.ORDENES_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-446: crear orden desde demanda con PostgreSQL real', () => {
  const schema = `abc446_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let ds: DataSource;
  let ordenes: OrdenesService;
  let demandas: DemandaService;
  const actor = { sub: 7, rolNombre: 'Encargado de Producción', nombre: 'Ana' };

  beforeAll(async () => {
    admin = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), migrations: [] });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({
      ...(AppDataSource.options as PostgresConnectionOptions),
      schema,
      extra: { options: `-c search_path=${schema}` },
    });
    await ds.initialize();
    await ds.runMigrations();
    await ds.query(`INSERT INTO recetas (producto_codigo, producto_nombre) VALUES ('PAN', 'Pan'), ('TORTA', 'Torta')`);
    demandas = new DemandaService(ds.getRepository(Demanda));
    const recetas = {
      findActivaPorProductoCodigo: async (codigo: string) =>
        (await ds.query('SELECT id::int AS id FROM recetas WHERE producto_codigo = $1', [codigo]))[0],
    };
    ordenes = new OrdenesService(
      ds.getRepository(OrdenProduccion), ds.getRepository(HistorialEstadoOrden), {} as any, recetas as any, demandas,
    );
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      if (!/^abc446_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  async function demanda(productos: string[]) {
    const [d] = await ds.query(
      `INSERT INTO demandas (origen, demanda_externa_id, fecha_requerida, estado, event_id, correlation_id, contenido_hash, confirmada_en)
       VALUES ('VENTAS', $1, '2099-12-05', 'CONFIRMADA', $2, $3, $4, NOW()) RETURNING id::text AS id`,
      [`PED-${randomUUID()}`, randomUUID(), randomUUID(), 'a'.repeat(64)],
    );
    for (const p of productos) {
      await ds.query(`INSERT INTO demandas_items (demanda_id, producto_codigo, cantidad, unidad) VALUES ($1, $2, 10, 'unidad')`, [d.id, p]);
    }
    return d.id as string;
  }
  const planificables = async () => (await demandas.listarPlanificables({ page: 1, limit: 100 })).items;

  it('dos pedidos a la vez crean una sola orden y el otro recibe 409', async () => {
    const id = await demanda(['PAN']);
    const resultados = await Promise.allSettled([
      ordenes.crearDesdeDemanda(id, {}, actor),
      ordenes.crearDesdeDemanda(id, {}, actor),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ConflictException);
    expect(await ds.query('SELECT 1 FROM ordenes_produccion WHERE demanda_id = $1', [id])).toHaveLength(1);
    expect((await planificables()).map((d) => d.id)).not.toContain(id);
  });

  it('sigue planificable mientras falte un producto e indica la orden del otro', async () => {
    const id = await demanda(['PAN', 'TORTA']);
    const orden = await ordenes.crearDesdeDemanda(id, { producto_codigo: 'PAN' }, actor);
    const fila = (await planificables()).find((d) => d.id === id)!;
    expect(fila.items.map((it) => [it.productoCodigo, it.orden?.codigo ?? null])).toEqual([
      ['PAN', orden.codigo], ['TORTA', null],
    ]);
    await ordenes.crearDesdeDemanda(id, { producto_codigo: 'TORTA' }, actor);
    expect((await planificables()).map((d) => d.id)).not.toContain(id);
  });

  it('una orden cancelada no cuenta: la demanda vuelve a ser planificable', async () => {
    const id = await demanda(['PAN']);
    const orden = await ordenes.crearDesdeDemanda(id, {}, actor);
    await ds.query(`UPDATE ordenes_produccion SET estado = 'CANCELADA', cancelada_en = NOW() WHERE id = $1`, [orden.id]);
    expect((await planificables()).map((d) => d.id)).toContain(id);
    await expect(ordenes.crearDesdeDemanda(id, {}, actor)).resolves.toMatchObject({ demanda_id: id });
  });
});
