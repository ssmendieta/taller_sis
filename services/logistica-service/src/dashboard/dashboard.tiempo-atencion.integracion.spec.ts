import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CrearSolicitudesSalida1710000000001 } from '../database/migrations/1710000000001-CrearSolicitudesSalida';
import { CrearBoletasEnvio1710000000002 } from '../database/migrations/1710000000002-CrearBoletasEnvio';
import { CrearRutas1710000000005 } from '../database/migrations/1710000000005-CrearRutas';
import { EstadosDespachoEntrega1710000000006 } from '../database/migrations/1710000000006-EstadosDespachoEntrega';
import { CrearRespaldoRecursosLogisticos1710000000007 } from '../database/migrations/1710000000007-CrearRespaldoRecursosLogisticos';
import { ProductoUnidadBoleta1710000000013 } from '../database/migrations/1710000000013-ProductoUnidadBoleta';
import { HoraRealEntregaParada1710000000016 } from '../database/migrations/1710000000016-HoraRealEntregaParada';
import { DashboardService } from './dashboard.service';

const conPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

conPostgres('ABC-478: tiempo de atención con PostgreSQL real', () => {
  const schema = `abc478_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let ds: DataSource;
  let service: DashboardService;

  beforeAll(async () => {
    const connection = {
      type: 'postgres' as const,
      host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
      username: process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.DB_LOGISTICA_DATABASE || process.env.LOGISTICA_DB || 'logistica_db',
    };
    admin = await new DataSource(connection).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = await new DataSource({ ...connection, schema, entities: [],
      migrations: [CrearSolicitudesSalida1710000000001, CrearBoletasEnvio1710000000002,
        CrearRutas1710000000005, EstadosDespachoEntrega1710000000006,
        CrearRespaldoRecursosLogisticos1710000000007, ProductoUnidadBoleta1710000000013,
        HoraRealEntregaParada1710000000016],
      extra: { options: `-c search_path=${schema}` },
    }).initialize();
    await ds.runMigrations();
    service = new DashboardService(ds);
  });

  beforeEach(async () => {
    await ds.query('TRUNCATE solicitudes_salida, rutas RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      if (!/^abc478_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  const id = async (sql: string, params: unknown[] = []) => (await ds.query(sql, params))[0].id as string;
  const solicitud = (creada = '2026-11-01T00:00:00Z') => id(
    `INSERT INTO solicitudes_salida (orden_id,destino_documental,motivo,responsable_usuario_id,creado_en)
     VALUES (1,'Destino','Prueba',1,$1) RETURNING id`, [creada]);
  const boleta = (s: string, estado = 'EMITIDA') => id(
    `INSERT INTO boletas_envio (solicitud_salida_id,estado,responsable_usuario_id)
     VALUES ($1,$2,1) RETURNING id`, [s, estado]);

  async function parada(boletas: string[], hora: string | null, estado = 'ENTREGADA', rutaEstado = 'DESPACHADA') {
    // Fecha programada deliberadamente distinta de la entrega real.
    const r = await id(`INSERT INTO rutas (fecha_programada,vehiculo_externo_id,chofer_externo_id,
      responsable_usuario_id,estado,despachada_en,despachada_por_usuario_id)
      VALUES ('2026-10-01','V1','C1',1,$1,'2026-10-01T00:00:00Z',1) RETURNING id`, [rutaEstado]);
    const p = await id(`INSERT INTO rutas_paradas (ruta_id,secuencia,destino,estado_entrega,
      entrega_actualizada_en,entrega_usuario_id,entregada_en)
      VALUES ($1,1,'Destino',$2,COALESCE($3::timestamptz,'2026-11-01T00:00:00Z'),1,$3) RETURNING id`, [r, estado, hora]);
    for (const b of boletas) await ds.query('INSERT INTO rutas_paradas_boletas (parada_id,boleta_id) VALUES ($1,$2)', [p, b]);
  }

  const valor = async (filtro = {}) => (await service.obtenerMetricas(filtro)).tiempo_atencion;

  it('devuelve sin datos sin solicitudes entregadas', async () => {
    expect(await valor()).toEqual({ promedio_horas: null, solicitudes_entregadas: 0, unidad: 'horas' });
  });

  it('calcula una solicitud en horas y mantiene decimales', async () => {
    await parada([await boleta(await solicitud())], '2026-11-01T02:30:00Z');
    expect(await valor()).toMatchObject({ promedio_horas: 2.5, solicitudes_entregadas: 1 });
  });

  it('promedia por solicitud, sin ponderar por cantidad de boletas o paradas', async () => {
    const s = await solicitud();
    const b = await boleta(s);
    await parada([b, await boleta(s)], '2026-11-01T02:00:00Z');
    await parada([b], '2026-11-01T04:00:00Z');
    await parada([await boleta(await solicitud())], '2026-11-01T06:00:00Z');
    expect(await valor()).toMatchObject({ promedio_horas: 4, solicitudes_entregadas: 2 });
  });

  it('completa una solicitud al entregar la última boleta activa', async () => {
    const s = await solicitud();
    await parada([await boleta(s)], '2026-11-01T02:00:00Z');
    await parada([await boleta(s)], '2026-11-01T08:00:00Z');
    await boleta(s, 'ANULADA');
    expect(await valor()).toMatchObject({ promedio_horas: 8, solicitudes_entregadas: 1 });
  });

  it('excluye solicitudes parcialmente entregadas o con boleta en borrador', async () => {
    for (const estado of ['EMITIDA', 'BORRADOR']) {
      const s = await solicitud();
      await parada([await boleta(s)], '2026-11-01T02:00:00Z');
      await boleta(s, estado);
    }
    expect((await valor()).promedio_horas).toBeNull();
  });

  it('excluye horas ausentes, negativas y solicitudes sin boletas activas', async () => {
    await parada([await boleta(await solicitud())], null);
    await parada([await boleta(await solicitud())], '2026-10-31T23:00:00Z');
    await boleta(await solicitud(), 'ANULADA');
    await solicitud();
    expect((await valor()).solicitudes_entregadas).toBe(0);
  });

  it('excluye pendientes, anuladas y rutas canceladas; permite un nuevo intento válido', async () => {
    const b = await boleta(await solicitud());
    await parada([b], null, 'ANULADA');
    await parada([b], null, 'PENDIENTE');
    await parada([b], '2026-11-01T01:00:00Z', 'ENTREGADA', 'CANCELADA');
    expect((await valor()).promedio_horas).toBeNull();
    await parada([b], '2026-11-01T03:00:00Z');
    expect((await valor()).promedio_horas).toBe(3);
  });

  it('filtra por entrega final real, aunque solicitud y fecha programada sean anteriores', async () => {
    const s = await solicitud();
    await parada([await boleta(s)], '2026-11-01T02:00:00Z');
    await parada([await boleta(s)], '2026-11-02T02:00:00Z');
    expect((await valor({ desde: '2026-11-01', hasta: '2026-11-01' })).promedio_horas).toBeNull();
    expect(await valor({ desde: '2026-11-02', hasta: '2026-11-02' })).toMatchObject({ promedio_horas: 26, solicitudes_entregadas: 1 });
    expect((await valor({ desde: '2026-11-03' })).promedio_horas).toBeNull();
    expect((await valor({ hasta: '2026-11-01' })).promedio_horas).toBeNull();
  });

  it('incluye ambos extremos del día UTC y excluye el día siguiente', async () => {
    for (const hora of ['2026-11-02T00:00:00Z', '2026-11-02T23:59:59.999Z', '2026-11-03T00:00:00Z']) {
      await parada([await boleta(await solicitud())], hora);
    }
    expect(await valor({ desde: '2026-11-02', hasta: '2026-11-02' })).toMatchObject({ promedio_horas: 36, solicitudes_entregadas: 2 });
  });

  it('distingue una entrega inmediata válida de la ausencia de entregas', async () => {
    await parada([await boleta(await solicitud())], '2026-11-01T00:00:00Z');
    expect(await valor()).toMatchObject({ promedio_horas: 0, solicitudes_entregadas: 1 });
  });
});
