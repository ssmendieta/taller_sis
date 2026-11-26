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

// ABC-490: ejecuta el SQL real del uso de capacidad contra PostgreSQL.
const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

describeConPostgres('ABC-490: uso de capacidad con PostgreSQL real', () => {
  const schema = `abc490_${process.pid}_${Date.now()}`;
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
      ...connection,
      schema,
      entities: [],
      migrations: [
        CrearSolicitudesSalida1710000000001, CrearBoletasEnvio1710000000002, CrearRutas1710000000005,
        EstadosDespachoEntrega1710000000006, CrearRespaldoRecursosLogisticos1710000000007, ObservacionesDespachoEntrega1710000000008,
        CrearIncidenciasTransporte1710000000009, ProductoUnidadBoleta1710000000013,
        HoraRealEntregaParada1710000000016,
      ],
      migrationsTableName: 'migrations_abc490',
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
      if (!/^abc490_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  const id = async (sql: string, params: unknown[]) => (await ds.query(sql, params))[0].id as string;

  async function boleta(unidad: string | null, cantidad: string) {
    const solicitud = await id(
      "INSERT INTO solicitudes_salida (orden_id, destino_documental, motivo, responsable_usuario_id) VALUES (1,'D','M',1) RETURNING id", []);
    const b = await id(
      "INSERT INTO boletas_envio (solicitud_salida_id, estado, responsable_usuario_id, producto_codigo, unidad) VALUES ($1,'EMITIDA',1,'P',$2) RETURNING id",
      [solicitud, unidad]);
    await ds.query("INSERT INTO boletas_envio_items (boleta_id, referencia, cantidad) VALUES ($1,'LOTE',$2)", [b, cantidad]);
    return b;
  }

  async function ruta(fecha: string, vehiculo: string, estado: string, paradas: Array<{ boletas: string[]; anulada?: string }>) {
    const salio = estado === 'DESPACHADA' || estado === 'COMPLETADA';
    const r = await id(
      `INSERT INTO rutas (fecha_programada, vehiculo_externo_id, chofer_externo_id, estado, responsable_usuario_id,
                          despachada_en, despachada_por_usuario_id, completada_en)
       VALUES ($1,$2,'CHO-1',$3,1,$4,$5,$6) RETURNING id`,
      [fecha, vehiculo, estado, salio ? `${fecha}T12:00:00Z` : null, salio ? 1 : null, estado === 'COMPLETADA' ? `${fecha}T18:00:00Z` : null]);
    for (const [i, p] of paradas.entries()) {
      const parada = await id(
        `INSERT INTO rutas_paradas (ruta_id, secuencia, destino, estado_entrega, entrega_actualizada_en, entrega_usuario_id)
         VALUES ($1,$2,'D',$3,$4,$5) RETURNING id`,
        [r, i + 1, p.anulada ? 'ANULADA' : 'PENDIENTE', p.anulada ?? null, p.anulada ? 1 : null]);
      for (const b of p.boletas) await ds.query('INSERT INTO rutas_paradas_boletas (parada_id, boleta_id) VALUES ($1,$2)', [parada, b]);
    }
    return r;
  }

  async function sembrar() {
    for (const fecha of ['2026-11-10', '2026-11-11']) {
      const s = await id(
        "INSERT INTO recursos_externos_snapshots (fecha, version, generado_en, sincronizado_en, datos) VALUES ($1,'v1',NOW(),NOW(),'{}') RETURNING id", [fecha]);
      await ds.query(
        `INSERT INTO recursos_externos_vehiculos (snapshot_id, fecha, id_externo, placa, capacidad_valor, capacidad_unidad, disponible)
         VALUES ($1,$2,'VEH-01','AAA',1000,'kg',true), ($1,$2,'VEH-02','BBB',50,'caja',true)`, [s, fecha]);
    }
    const compartida = await boleta('kg', '200');
    await ruta('2026-11-10', 'VEH-01', 'COMPLETADA', [
      { boletas: [compartida] },
      { boletas: [compartida, await boleta('kg', '300')] }, // la boleta repetida suma una vez
      { boletas: [await boleta('kg', '400')], anulada: '2026-11-10T11:00:00Z' }, // antes de salir: no cargada
      { boletas: [await boleta('kg', '100')], anulada: '2026-11-10T15:00:00Z' }, // después de salir: viajó
    ]); // 200 + 300 + 100 = 60 %
    await ruta('2026-11-11', 'VEH-02', 'DESPACHADA', [{ boletas: [await boleta('kg', '10')] }]); // kg contra caja
    await ruta('2026-11-11', 'VEH-01', 'DESPACHADA', [{ boletas: [await boleta('kg', '1000')] }]); // 100 %
    await ruta('2026-11-12', 'VEH-01', 'DESPACHADA', [{ boletas: [await boleta('kg', '10')] }]); // sin copia de esa fecha
    await ruta('2026-11-10', 'VEH-02', 'PLANIFICADA', [{ boletas: [await boleta('caja', '10')] }]);
    await ruta('2026-11-10', 'VEH-02', 'CANCELADA', [{ boletas: [await boleta('caja', '10')] }]);
  }

  it('calcula por ruta y vehículo, sin planificadas ni canceladas', async () => {
    const uso = (await service.obtenerMetricas()).uso_capacidad;
    expect(uso.por_ruta.map((r) => [r.fecha, r.vehiculo_externo_id, r.porcentaje, r.motivo])).toEqual([
      ['2026-11-10', 'VEH-01', 60, null],
      ['2026-11-11', 'VEH-02', null, 'UNIDAD_INCOMPATIBLE'],
      ['2026-11-11', 'VEH-01', 100, null],
      ['2026-11-12', 'VEH-01', null, 'CAPACIDAD_FALTANTE'],
    ]);
    expect(uso).toMatchObject({ porcentaje: 80, rutas_calculables: 2, rutas_no_calculables: 2 });
    expect(uso.por_vehiculo).toEqual([
      { vehiculo_externo_id: 'VEH-01', placa: 'AAA', porcentaje: 80, rutas_calculables: 2, rutas_no_calculables: 1 },
      { vehiculo_externo_id: 'VEH-02', placa: 'BBB', porcentaje: null, rutas_calculables: 0, rutas_no_calculables: 1 },
    ]);
  });

  it('filtra por la fecha programada', async () => {
    const uso = (await service.obtenerMetricas({ desde: '2026-11-10', hasta: '2026-11-10' })).uso_capacidad;
    expect(uso).toMatchObject({ porcentaje: 60, rutas_calculables: 1, rutas_no_calculables: 0 });
  });

  it('un período sin rutas queda sin datos', async () => {
    expect((await service.obtenerMetricas({ desde: '2030-01-01' })).uso_capacidad.porcentaje).toBeNull();
  });
});
