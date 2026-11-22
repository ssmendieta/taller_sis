import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';
import { CrearMetasKpi1710000000030 } from '../database/migrations/1710000000030-CrearMetasKpi';
import { AvisosKpi1710000000031 } from '../database/migrations/1710000000031-AvisosKpi';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ABC-526: ejecuta el SQL real de avisos (cambio a rojo, leído y contador) contra PostgreSQL.
const describeConPostgres = process.env.RUN_DB_INTEGRATION === 'true' ? describe : describe.skip;

const KPI = 'FPY';

describeConPostgres('ABC-526: avisos de KPI con PostgreSQL real', () => {
  const schema = `abc526_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let dataSource: DataSource;
  let valorActual: number | null;
  let service: DashboardService;

  class ServicioConValor extends DashboardService {
    protected async obtenerValorKpi(kpi: string): Promise<number | null> {
      return kpi === KPI ? valorActual : null;
    }
  }

  const calcular = () => service.obtenerKpisConSemaforo();

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

    dataSource = new DataSource({
      ...connection,
      schema,
      entities: [],
      migrations: [CrearMetasKpi1710000000030, AvisosKpi1710000000031],
      migrationsTableName: 'migrations_abc526',
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    service = new ServicioConValor(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (admin?.isInitialized) {
      if (!/^abc526_\d+_\d+$/.test(schema)) throw new Error('Esquema temporal inválido');
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.destroy();
    }
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM avisos_kpi');
    await dataSource.query('UPDATE metas_kpi SET ultimo_color = NULL');
    valorActual = 96;
  });

  it('un KPI en rojo en varios cálculos registra un solo aviso', async () => {
    for (const v of [70, 65, 60, 68, 55]) {
      valorActual = v;
      await calcular();
    }
    const avisos = await service.listarAvisos();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ kpi: KPI, valor: 70, leido: false });
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 1 });
  });

  it('cálculos concurrentes con el mismo cambio a rojo registran un solo aviso', async () => {
    valorActual = 70;
    await Promise.all(Array.from({ length: 10 }, () => calcular()));
    expect(await service.listarAvisos()).toHaveLength(1);
  });

  it('marcar como leído baja el contador y no se re-avisa mientras siga en rojo', async () => {
    valorActual = 70;
    await calcular();
    const [aviso] = await service.listarAvisos(false);
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 1 });

    const leido = await service.marcarAvisoLeido(aviso.id);
    expect(leido.leido).toBe(true);
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 0 });
    expect(await service.listarAvisos(false)).toHaveLength(0);

    valorActual = 62;
    await calcular();
    await calcular();
    expect(await service.listarAvisos()).toHaveLength(1);
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 0 });
  });

  it('volver a rojo tras verde crea otro aviso y suma al contador', async () => {
    valorActual = 70;
    await calcular();
    const [primero] = await service.listarAvisos(false);
    await service.marcarAvisoLeido(primero.id);
    valorActual = 96;
    await calcular();
    valorActual = 62;
    await calcular();
    expect(await service.listarAvisos()).toHaveLength(2);
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 1 });
  });

  it('amarillo no genera aviso', async () => {
    valorActual = 80;
    await calcular();
    expect(await service.listarAvisos()).toHaveLength(0);
    expect(await service.contarAvisosSinLeer()).toEqual({ total: 0 });
  });
});
