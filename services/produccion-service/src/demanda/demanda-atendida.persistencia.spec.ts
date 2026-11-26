import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { AppDataSource } from '../database/data-source';
import { validarDemandaAtendidaV1 } from '../integraciones/contratos/ventas-demanda-atendida-v1.validator';
import { LotesService } from '../lotes/lotes.service';
import { HistorialEstadoOrden } from '../ordenes/entities/historial-estado-orden.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { EstadoOrden } from '../ordenes/estado-orden.enum';
import { OrdenesService } from '../ordenes/ordenes.service';
import { registrarDemandaAtendidaSiCorresponde } from './demanda-atendida';

// ABC-432: con PostgreSQL real y todas las migraciones. Demanda parcial, atendida,
// repetición y concurrencia: una demanda atendida deja exactamente un evento.
const describeReal = process.env.DEMANDA_DB_REAL === '1' ? describe : describe.skip;

describeReal('ABC-432: DemandaAtendida en el outbox con PostgreSQL real', () => {
  const schema = `abc432_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let ds: DataSource;
  let ordenes: OrdenesService;
  let lotes: LotesService;
  const actor = { sub: 7, rolNombre: 'Encargado de Producción', nombre: 'Ana' };

  beforeAll(async () => {
    admin = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), migrations: [] });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({ ...(AppDataSource.options as PostgresConnectionOptions), schema, extra: { options: `-c search_path=${schema}` } });
    await ds.initialize();
    await ds.runMigrations();
    await ds.query(`INSERT INTO recetas (producto_codigo, producto_nombre) VALUES ('PAN', 'Pan'), ('TORTA', 'Torta')`);
    ordenes = new OrdenesService(ds.getRepository(OrdenProduccion), ds.getRepository(HistorialEstadoOrden), {} as any, {} as any);
    lotes = new LotesService(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      if (!/^abc432_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  async function demanda(items: Array<[string, string]>, estado = 'CONFIRMADA') {
    const [d] = await ds.query(
      `INSERT INTO demandas (origen, demanda_externa_id, fecha_requerida, estado, event_id, correlation_id, contenido_hash, confirmada_en)
       VALUES ('VENTAS', $1, '2099-12-05', $2::varchar, $3, $4, $5, CASE WHEN $2::varchar = 'CONFIRMADA' THEN NOW() END) RETURNING id::text AS id`,
      [`PED-${randomUUID().slice(0, 8)}`, estado, randomUUID(), randomUUID(), 'a'.repeat(64)],
    );
    for (const [producto, cantidad] of items) {
      await ds.query(`INSERT INTO demandas_items (demanda_id, producto_codigo, cantidad, unidad) VALUES ($1, $2, $3, 'UN')`, [d.id, producto, cantidad]);
    }
    return d.id as string;
  }

  // Orden en producción con resultados conformes suficientes para crear sus lotes.
  async function orden(demandaId: string, producto: string, conformes = '100') {
    const [o] = await ds.query(
      `INSERT INTO ordenes_produccion (codigo, receta_id, cantidad_solicitada, fecha_programada, estado, responsable_usuario_id, demanda_id, iniciada_en)
       SELECT $1, id, 10, '2099-12-05', 'EN_PRODUCCION', 7, $2, NOW() FROM recetas WHERE producto_codigo = $3 RETURNING id::int AS id`,
      [`ORD-${randomUUID().slice(0, 8)}`, demandaId, producto],
    );
    await ds.query(`INSERT INTO resultados_conformes (orden_id, cantidad, tipo, responsable_usuario_id) VALUES ($1, $2, 'CONFORME', 7)`, [o.id, conformes]);
    return o.id as number;
  }
  const lote = (ordenId: number, cantidad: number) => lotes.create({ ordenId, codigo: `L-${randomUUID().slice(0, 8)}`, cantidad }, 7);
  const finalizar = (id: number) => ordenes.cambiarEstado(id, { nuevoEstado: EstadoOrden.FINALIZADA } as any, actor);
  const eventos = async (demandaId: string) =>
    ds.query(`SELECT payload, estado FROM eventos_outbox WHERE aggregate_type = 'Demanda' AND aggregate_id = $1`, [demandaId]);

  it('parcial: falta un producto o falta cantidad, no registra evento', async () => {
    const id = await demanda([['PAN', '10'], ['TORTA', '5']]);
    const pan = await orden(id, 'PAN');
    await lote(pan, 10);
    await finalizar(pan);
    const torta = await orden(id, 'TORTA');
    await lote(torta, 4.9999);
    await finalizar(torta);
    expect(await eventos(id)).toHaveLength(0);
  });

  it('atendida al finalizar la última orden: un evento válido y pendiente de publicar', async () => {
    const id = await demanda([['PAN', '10.5'], ['TORTA', '5']]);
    const pan = await orden(id, 'PAN');
    await lote(pan, 6);
    await lote(pan, 4.5);
    await finalizar(pan);
    const torta = await orden(id, 'TORTA');
    await lote(torta, 5);
    expect(await eventos(id)).toHaveLength(0);
    await finalizar(torta);
    const [evento] = await eventos(id);
    expect(evento.estado).toBe('PENDIENTE');
    const payload = validarDemandaAtendidaV1(evento.payload);
    expect(payload.data).toMatchObject({
      demandaId: id, origen: 'VENTAS',
      items: [
        { productoCodigo: 'PAN', cantidadAtendida: '10.5000', unidad: 'UN' },
        { productoCodigo: 'TORTA', cantidadAtendida: '5.0000', unidad: 'UN' },
      ],
    });
  });

  it('atendida por un lote creado después de finalizar la orden', async () => {
    const id = await demanda([['PAN', '10']]);
    const pan = await orden(id, 'PAN');
    await lote(pan, 3);
    await finalizar(pan);
    expect(await eventos(id)).toHaveLength(0);
    await lote(pan, 7);
    expect(await eventos(id)).toHaveLength(1);
  });

  it('repetición: más lotes o nuevas llamadas no registran un segundo evento', async () => {
    const id = await demanda([['PAN', '10']]);
    const pan = await orden(id, 'PAN');
    await lote(pan, 10);
    await finalizar(pan);
    await lote(pan, 5);
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => ds.transaction((m) => registrarDemandaAtendidaSiCorresponde(m, id))),
    );
    expect(resultados.every((r) => r === 'YA_REGISTRADO')).toBe(true);
    expect(await eventos(id)).toHaveLength(1);
  });

  it('concurrencia: dos transacciones que la completan a la vez registran un solo evento', async () => {
    const id = await demanda([['PAN', '10']]);
    const pan = await orden(id, 'PAN');
    await lote(pan, 10);
    await ds.query(`UPDATE ordenes_produccion SET estado = 'FINALIZADA', finalizada_en = NOW() WHERE id = $1`, [pan]);
    const resultados = await Promise.all(
      Array.from({ length: 6 }, () => ds.transaction((m) => registrarDemandaAtendidaSiCorresponde(m, id))),
    );
    expect(resultados.filter((r) => r === 'REGISTRADO')).toHaveLength(1);
    expect(await eventos(id)).toHaveLength(1);
  });

  it('una orden cancelada, una demanda no confirmada o una orden sin demanda no cuentan', async () => {
    const id = await demanda([['PAN', '10']]);
    const pan = await orden(id, 'PAN');
    await lote(pan, 10);
    await ds.query(`UPDATE ordenes_produccion SET estado = 'CANCELADA', cancelada_en = NOW() WHERE id = $1`, [pan]);
    expect(await ds.transaction((m) => registrarDemandaAtendidaSiCorresponde(m, id))).toBe('NO_ATENDIDA');
    const recibida = await demanda([['PAN', '1']], 'RECIBIDA');
    expect(await ds.transaction((m) => registrarDemandaAtendidaSiCorresponde(m, recibida))).toBe('NO_ATENDIDA');
    expect(await ds.transaction((m) => registrarDemandaAtendidaSiCorresponde(m, null))).toBe('SIN_DEMANDA');
  });

  it('si falla el registro, la finalización de la orden se revierte (misma transacción)', async () => {
    const id = await demanda([['PAN', '10']]);
    const pan = await orden(id, 'PAN');
    await lote(pan, 10);
    await ds.query(`ALTER TABLE eventos_outbox ADD CONSTRAINT ck_prueba_falla CHECK (aggregate_type <> 'Demanda') NOT VALID`);
    try {
      await expect(finalizar(pan)).rejects.toThrow();
    } finally {
      await ds.query('ALTER TABLE eventos_outbox DROP CONSTRAINT ck_prueba_falla');
    }
    const [{ estado }] = await ds.query('SELECT estado FROM ordenes_produccion WHERE id = $1', [pan]);
    expect(estado).toBe('EN_PRODUCCION');
  });
});
