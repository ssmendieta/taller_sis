import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

const CUENTAS = {
  encargadoLogistica: {
    id: '15',
    rol: 'Encargado de Logística',
    permisos: ['logistica.rutas.consultar', 'logistica.boletas.consultar'],
  },
  operadorSinPermiso: {
    id: '99',
    rol: 'Operario',
    permisos: ['otras.operaciones'],
  },
};

type Cuenta = keyof typeof CUENTAS | null;

describe('Dashboard HTTP Logística (ABC-328): GET /dashboard/metricas', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const queryMock = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        PermisoLogisticaGuard,
        {
          provide: DataSource,
          useValue: { query: queryMock },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = url.toString();
      if (!urlStr.includes('/me')) {
        return httpFetch(url, init);
      }

      const token = (new Headers(init?.headers).get('authorization') ?? '').replace(
        /^Bearer\s+/i,
        '',
      );

      const cuenta = CUENTAS[token as keyof typeof CUENTAS];
      if (!cuenta) {
        return new Response(JSON.stringify({ message: 'No autenticado' }), { status: 401 });
      }

      return new Response(JSON.stringify(cuenta), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    queryMock.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function consultarMetricas(query = '', cuenta: Cuenta = 'encargadoLogistica') {
    const res = await httpFetch(`${base}/dashboard/metricas${query ? `?${query}` : ''}`, {
      headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    return {
      status: res.status,
      body: await res.json().catch(() => null),
    };
  }

  it('rechaza con 401 si no se envía encabezado de autorización', async () => {
    const res = await consultarMetricas('', null);
    expect(res.status).toBe(401);
  });

  it('rechaza con 403 si el usuario autenticado no posee permiso "logistica.rutas.consultar"', async () => {
    const res = await consultarMetricas('', 'operadorSinPermiso');
    expect(res.status).toBe(403);
  });

  it('responde 200 con estructura de métricas completa cuando el encargado de logística consulta', async () => {
    const res = await consultarMetricas('', 'encargadoLogistica');
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body).toHaveProperty('periodo');
    expect(body).toHaveProperty('resumen');
    expect(body).toHaveProperty('boletas_por_estado');
    expect(body).toHaveProperty('rutas_por_estado');
    expect(body).toHaveProperty('entregas');
    expect(body).toHaveProperty('incidencias');
    expect(body).toHaveProperty('volumen_carga');
  });

  it('rechaza con 400 cuando "desde" es posterior a "hasta"', async () => {
    const res = await consultarMetricas('desde=2026-11-20&hasta=2026-11-01', 'encargadoLogistica');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('rango de fechas es inválido');
  });

  it('acepta parámetros de fecha válidos y responde 200', async () => {
    const res = await consultarMetricas('desde=2026-10-01&hasta=2026-10-31', 'encargadoLogistica');
    expect(res.status).toBe(200);
    expect(res.body.periodo).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-31',
    });
  });
});
