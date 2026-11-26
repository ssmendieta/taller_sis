import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { ResultadosConformes1710000000014 } from '../database/migrations/1710000000014-ResultadosConformes';
import { TipoResultadoCalidad1710000000015 } from '../database/migrations/1710000000015-TipoResultadoCalidad';
import { Reprocesos1710000000027 } from '../database/migrations/1710000000027-Reprocesos';
import { DashboardService } from './dashboard.service';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ABC-512: el detalle del FPY coincide con el KPI ejecutando el SQL real.
const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

describeConPostgres('ABC-512: detalle del FPY con PostgreSQL real', () => {
  const schema = `abc512_${process.pid}_${Date.now()}`;
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
      database: process.env.DB_PRODUCCION_DATABASE || process.env.PRODUCCION_DB || 'produccion_db',
    };
    admin = new DataSource(connection);
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({
      ...connection, schema, entities: [],
      migrations: [ResultadosConformes1710000000014, TipoResultadoCalidad1710000000015, Reprocesos1710000000027],
      migrationsTableName: 'migrations_abc512',
      extra: { options: `-c search_path=${schema}` },
    });
    await ds.initialize();
    // Solo las columnas de la orden que intervienen en el detalle.
    await ds.query(`CREATE TABLE ordenes_produccion (id BIGINT PRIMARY KEY, codigo VARCHAR(40) NOT NULL, estado VARCHAR(20) NOT NULL,
      fecha_programada DATE, iniciada_en TIMESTAMPTZ, finalizada_en TIMESTAMPTZ)`);
    await ds.runMigrations();
    await ds.query("INSERT INTO ordenes_produccion VALUES (1,'OP-1','FINALIZADA'), (2,'OP-2','EN_PRODUCCION')");
    await ds.query(`INSERT INTO resultados_conformes (orden_id, cantidad, tipo, causa_defecto, responsable_usuario_id, fecha_hora) VALUES
      (1, 80.1, 'CONFORME', NULL, 1, '2026-11-01T10:00Z'),
      (1, 10, 'DEFECTUOSO', 'Rayado', 1, '2026-11-01T10:00Z'),
      (1, 5, 'DEFECTUOSO', 'Golpe', 1, '2026-11-01T10:00Z'),
      (2, 40.2, 'CONFORME', NULL, 1, '2026-11-02T10:00Z'),
      (2, 20, 'DEFECTUOSO', ' Golpe ', 1, '2026-11-02T10:00Z')`);
    await ds.query(`INSERT INTO reprocesos (orden_id, resultado_calidad_id, cantidad_procesada, cantidad_recuperada, cantidad_descartada, autor_usuario_id)
      SELECT orden_id, id, 10, 6, 4, 1 FROM resultados_conformes WHERE causa_defecto = 'Rayado'`);
    service = new DashboardService(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (admin?.isInitialized) {
      if (!/^abc512_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  const valorKpi = () => (service as unknown as { obtenerValorKpi(k: string): Promise<number | null> }).obtenerValorKpi('FPY');

  it('el valor del detalle es el del KPI y las causas suman las defectuosas', async () => {
    const res = await service.obtenerDetalleKpi('FPY');
    expect(res.valor).toBe(77.46); // 120.3 / 155.3
    expect(res.valor).toBe(await valorKpi());
    expect(res.registros.map((r) => [r.codigo, r.estado, r.conformes_primera, r.evaluadas])).toEqual([
      ['OP-1', 'FINALIZADA', 80.1, 95.1], ['OP-2', 'EN_PRODUCCION', 40.2, 60.2],
    ]);
    expect(res.causas_defecto).toEqual([{ causa: 'Golpe', cantidad: 25 }, { causa: 'Rayado', cantidad: 10 }]);
    expect(res.unidades_defectuosas).toBe(35);
  });

  it('respeta el periodo en registros y causas', async () => {
    const res = await service.obtenerDetalleKpi('FPY', { desde: '2026-11-02', hasta: '2026-11-02' });
    expect(res.registros.map((r) => r.codigo)).toEqual(['OP-2']);
    expect(res.causas_defecto).toEqual([{ causa: 'Golpe', cantidad: 20 }]);
  });

  it('un periodo sin registros queda vacío', async () => {
    expect(await service.obtenerDetalleKpi('FPY', { desde: '2030-01-01' })).toMatchObject({ valor: null, registros: [], causas_defecto: [] });
  });

  describe('ABC-512: cumplimiento de fecha y tiempo de ciclo', () => {
    const kpi = (nombre: string) => (service as unknown as { obtenerValorKpi(k: string): Promise<number | null> }).obtenerValorKpi(nombre);
    beforeAll(async () => {
      await ds.query(`INSERT INTO ordenes_produccion VALUES
        (10, 'OP-10', 'FINALIZADA', '2026-11-05', '2026-11-04T08:00Z', '2026-11-05T10:30Z'),
        (11, 'OP-11', 'FINALIZADA', '2026-11-05', '2026-11-05T08:00Z', '2026-11-06T09:00Z'),
        (12, 'OP-12', 'FINALIZADA', '2026-11-10', '2026-11-09T08:00Z', '2026-11-09T09:20Z'),
        (13, 'OP-13', 'EN_PRODUCCION', '2026-11-10', '2026-11-09T08:00Z', NULL),
        (14, 'OP-14', 'FINALIZADA', '2026-11-10', NULL, '2026-11-09T12:00Z')`);
    });

    it('cumplimiento: una fila por orden finalizada, a tiempo o tarde, y el valor coincide', async () => {
      const res = await service.obtenerDetalleKpi('CUMPLIMIENTO_FECHA');
      expect(res.registros.map((r) => [r.codigo, r.a_tiempo, r.valor])).toEqual([
        ['OP-10', true, 100], ['OP-11', false, 0], ['OP-12', true, 100], ['OP-14', true, 100],
      ]);
      expect(res.valor).toBe(75);
      expect(res.valor).toBe(await kpi('CUMPLIMIENTO_FECHA'));
    });

    it('tiempo de ciclo: horas por orden y el promedio coincide con el KPI', async () => {
      const res = await service.obtenerDetalleKpi('TIEMPO_CICLO');
      expect(res.unidad).toBe('horas');
      expect(res.registros.map((r) => [r.codigo, r.valor])).toEqual([['OP-10', 26.5], ['OP-11', 25], ['OP-12', 1.33]]);
      expect(res.valor).toBe(await kpi('TIEMPO_CICLO'));
      expect(res.valor).toBe(17.61);
    });

    it('respetan el periodo por fecha de fin', async () => {
      const filtro = { desde: '2026-11-06', hasta: '2026-11-06' };
      expect((await service.obtenerDetalleKpi('CUMPLIMIENTO_FECHA', filtro)).registros.map((r) => r.codigo)).toEqual(['OP-11']);
      expect((await service.obtenerDetalleKpi('TIEMPO_CICLO', filtro))).toMatchObject({ valor: 25, registros: [expect.objectContaining({ codigo: 'OP-11' })] });
    });
  });
});
