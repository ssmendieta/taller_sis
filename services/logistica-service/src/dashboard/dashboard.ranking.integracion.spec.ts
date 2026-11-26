import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { CrearRutas1710000000005 } from '../database/migrations/1710000000005-CrearRutas';
import { EstadosDespachoEntrega1710000000006 } from '../database/migrations/1710000000006-EstadosDespachoEntrega';
import { CrearRespaldoRecursosLogisticos1710000000007 } from '../database/migrations/1710000000007-CrearRespaldoRecursosLogisticos';
import { ObservacionesDespachoEntrega1710000000008 } from '../database/migrations/1710000000008-ObservacionesDespachoEntrega';
import { CrearIncidenciasTransporte1710000000009 } from '../database/migrations/1710000000009-CrearIncidenciasTransporte';
import { ProductoUnidadBoleta1710000000013 } from '../database/migrations/1710000000013-ProductoUnidadBoleta';
import { HoraRealEntregaParada1710000000016 } from '../database/migrations/1710000000016-HoraRealEntregaParada';
import { DashboardService } from './dashboard.service';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ABC-420, ABC-422 y ABC-520 con PostgreSQL real: puntualidad, incidencias y ranking.
const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

describeConPostgres('ABC-520: KPIs por chofer y vehículo con PostgreSQL real', () => {
  const schema = `abc520_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let ds: DataSource;
  let service: DashboardService;

  beforeAll(async () => {
    const connection = {
      type: 'postgres' as const,
      host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
      username: process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.DB_LOGISTICA_DATABASE || process.env.LOGISTICA_DB || 'logistica_db',
    };
    admin = new DataSource(connection);
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({
      ...connection, schema, entities: [],
      migrations: [
        CrearSolicitudesSalida1710000000001, CrearBoletasEnvio1710000000002, CrearRutas1710000000005,
        EstadosDespachoEntrega1710000000006, CrearRespaldoRecursosLogisticos1710000000007,
        ObservacionesDespachoEntrega1710000000008, CrearIncidenciasTransporte1710000000009,
        ProductoUnidadBoleta1710000000013, HoraRealEntregaParada1710000000016,
      ],
      migrationsTableName: 'migrations_abc520',
      extra: { options: `-c search_path=${schema}` },
    });
    await ds.initialize();
    await ds.runMigrations();
    service = new DashboardService(ds);
    await sembrar();
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      if (!/^abc520_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  const id = async (sql: string, params: unknown[] = []) => (await ds.query(sql, params))[0].id as string;

  async function boleta(cantidad: string) {
    const s = await id("INSERT INTO solicitudes_salida (orden_id, destino_documental, motivo, responsable_usuario_id) VALUES (1,'D','M',1) RETURNING id");
    const b = await id("INSERT INTO boletas_envio (solicitud_salida_id, estado, responsable_usuario_id, producto_codigo, unidad) VALUES ($1,'EMITIDA',1,'P','kg') RETURNING id", [s]);
    await ds.query("INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad) VALUES ($1,'L',$2)", [b, cantidad]);
    return b;
  }

  // Ruta despachada al mediodía UTC del día programado; cada parada con su entrega real (o null = pendiente).
  async function ruta(fecha: string, chofer: string, vehiculo: string, entregas: Array<string | null>, incidencias = 0, estado = 'DESPACHADA') {
    const r = await id(
      `INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, estado, responsable_usuario_id, despachada_en, despachada_por_usuario_id)
       VALUES ($1,$2,$3,$4,1,$5,1) RETURNING id`, [fecha, vehiculo, chofer, estado, `${fecha}T12:00:00Z`]);
    for (const [i, hora] of entregas.entries()) {
      const p = await id(
        `INSERT INTO rutas_paradas (ruta_id, secuencia, destino, estado_entrega, entrega_actualizada_en, entrega_usuario_id, entregada_en)
         VALUES ($1,$2,$3,$4,$5,$6,$5) RETURNING id`,
        [r, i + 1, `Destino ${r}-${i + 1}`, hora ? 'ENTREGADA' : 'PENDIENTE', hora, hora ? 1 : null]);
      await ds.query('INSERT INTO rutas_paradas_boletas (parada_id, boleta_id) VALUES ($1,$2)', [p, await boleta('100')]);
    }
    for (let i = 0; i < incidencias; i++) {
      await ds.query(`INSERT INTO incidencias_transporte (ruta_id, tipo, motivo, registrada_por_usuario_id) VALUES ($1,'RETRASO','Tráfico',1)`, [r]);
    }
    return r;
  }

  async function sembrar() {
    const s = await id("INSERT INTO recursos_externos_snapshots (fecha, version, generado_en, sincronizado_en, datos) VALUES ('2026-11-10','v1',NOW(),NOW(),'{}') RETURNING id");
    await ds.query(`INSERT INTO recursos_externos_vehiculos (snapshot_id, fecha, id_externo, placa, capacidad_valor, capacidad_unidad, disponible)
      VALUES ($1,'2026-11-10','VEH-1','AAA',1000,'kg',true), ($1,'2026-11-10','VEH-2','BBB',500,'kg',true), ($1,'2026-11-10','VEH-3','CCC',500,'kg',true)`, [s]);
    await ds.query(`INSERT INTO recursos_externos_choferes (snapshot_id, fecha, id_externo, nombre, disponible)
      VALUES ($1,'2026-11-10','CHO-1','Ana',true), ($1,'2026-11-10','CHO-2','Luis',true), ($1,'2026-11-10','CHO-3','Sin rutas',true)`, [s]);
    // Ana, VEH-1: 2 a tiempo (una a las 23:30 de Bolivia, ya del día siguiente en UTC), 1 tarde; 1 incidencia; 300/1000.
    await ruta('2026-11-10', 'CHO-1', 'VEH-1', ['2026-11-10T15:00:00Z', '2026-11-11T03:30:00Z', '2026-11-11T15:00:00Z'], 1);
    // Luis, VEH-2: 1 a tiempo, 1 pendiente; 3 incidencias; 200/500.
    await ruta('2026-11-10', 'CHO-2', 'VEH-2', ['2026-11-10T16:00:00Z', null], 3);
    // Luis con VEH-1 otro día: sin copia del ERP para esa fecha (uso no calculable); 1 tarde.
    await ruta('2026-11-12', 'CHO-2', 'VEH-1', ['2026-11-13T15:00:00Z'], 0);
    // Una ruta planificada no cuenta.
    await ruta('2026-11-10', 'CHO-3', 'VEH-3', [null], 2, 'PLANIFICADA');
  }

  it('calcula puntualidad (hora de Bolivia) e incidencias por cada 100 entregas', async () => {
    const m = await service.obtenerMetricas();
    expect(m.entregas_a_tiempo).toEqual({ porcentaje: 60, a_tiempo: 3, entregadas: 5, unidad: '%' });
    expect(m.incidencias_ruta).toEqual({ por_100: 66.67, incidencias: 4, entregas: 6, unidad: 'por 100' });
  });

  it.each(['CHOFER', 'VEHICULO'] as const)('ranking por %s: los grupos suman el total y el total es el KPI general', async (dimension) => {
    const filtro = { desde: '2026-11-01', hasta: '2026-11-30' };
    const [ranking, general] = await Promise.all([service.obtenerRanking({ ...filtro, dimension }), service.obtenerMetricas(filtro)]);
    const suma = (f: (x: (typeof ranking.filas)[number]) => number) => ranking.filas.reduce((s, x) => s + f(x), 0);
    expect(suma((x) => x.entregas_a_tiempo.a_tiempo)).toBe(general.entregas_a_tiempo.a_tiempo);
    expect(suma((x) => x.entregas_a_tiempo.entregadas)).toBe(general.entregas_a_tiempo.entregadas);
    expect(suma((x) => x.incidencias_ruta.incidencias)).toBe(general.incidencias_ruta.incidencias);
    expect(suma((x) => x.incidencias_ruta.entregas)).toBe(general.incidencias_ruta.entregas);
    expect(suma((x) => x.uso_capacidad.rutas_calculables)).toBe(general.uso_capacidad.rutas_calculables);
    expect(ranking.totales.entregas_a_tiempo).toEqual(general.entregas_a_tiempo);
    expect(ranking.totales.incidencias_ruta).toEqual(general.incidencias_ruta);
    expect(ranking.totales.uso_capacidad.porcentaje).toBe(general.uso_capacidad.porcentaje);
  });

  it('ranking por chofer: valores por grupo y "sin datos" para quien no tiene rutas', async () => {
    const r = await service.obtenerRanking({ dimension: 'CHOFER' });
    expect(r.filas.map((f) => [f.id, f.nombre, f.entregas_a_tiempo.porcentaje, f.incidencias_ruta.por_100, f.uso_capacidad.porcentaje, f.sin_datos])).toEqual([
      ['CHO-1', 'Ana', 66.67, 33.33, 30, false],
      ['CHO-2', 'Luis', 50, 100, 40, false],
      ['CHO-3', 'Sin rutas', null, null, null, true],
    ]);
  });

  it('detalle desde el ranking: solo las entregas del chofer elegido', async () => {
    const d = await service.obtenerDetalleKpi('ENTREGAS_A_TIEMPO', { chofer: 'CHO-1' });
    expect(d).toMatchObject({ valor: 66.67, recurso: { chofer: 'CHO-1', vehiculo: null } });
    expect(d.registros.map((x) => ('a_tiempo' in x ? x.a_tiempo : null))).toEqual([true, true, false]);
    const inc = await service.obtenerDetalleKpi('INCIDENCIAS_RUTA', { vehiculo: 'VEH-2' });
    expect(inc).toMatchObject({ valor: 150, registros: [expect.objectContaining({ entregas: 2, incidencias: 3 })] });
  });
});
