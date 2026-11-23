import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

const CUENTAS = {
  supervisor: {
    id: '42',
    rol: 'Supervisor',
    permisos: ['ordenes.consultar'],
  },
  operadorSinPermiso: {
    id: '99',
    rol: 'Operario',
    permisos: ['otras.operaciones'],
  },
};

type Cuenta = keyof typeof CUENTAS | null;

describe('Dashboard HTTP (ABC-324): GET /dashboard/metricas', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const queryMock = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        PermisoProduccionGuard,
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

  async function consultarMetricas(query = '', cuenta: Cuenta = 'supervisor') {
    const res = await httpFetch(`${base}/dashboard/metricas${query ? `?${query}` : ''}`, {
      headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    return {
      status: res.status,
      body: await res.json().catch(() => null),
    };
  }

  it('ABC-512: GET /dashboard/kpis/:kpi/detalle exige permiso, valida el KPI y responde', async () => {
    const pedir = (ruta: string, token?: string) =>
      httpFetch(`${base}/dashboard/kpis/${ruta}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});
    queryMock.mockResolvedValue([]);
    expect((await pedir('FPY/detalle')).status).toBe(401);
    expect((await pedir('FPY/detalle', 'operadorSinPermiso')).status).toBe(403);
    expect((await pedir('NO_EXISTE/detalle', 'supervisor')).status).toBe(404);
    expect((await pedir('FPY/detalle?otro=1', 'supervisor')).status).toBe(400);
    const res = await pedir('FPY/detalle?desde=2026-01-01', 'supervisor');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kpi: 'FPY', valor: null, registros: [] });
  });

  it('rechaza con 401 si no se envía encabezado de autorización', async () => {
    const res = await consultarMetricas('', null);
    expect(res.status).toBe(401);
  });

  it('rechaza con 403 si el usuario autenticado no posee permiso "ordenes.consultar"', async () => {
    const res = await consultarMetricas('', 'operadorSinPermiso');
    expect(res.status).toBe(403);
  });

  it('responde 200 con estructura de métricas completa cuando el supervisor consulta', async () => {
    const res = await consultarMetricas('', 'supervisor');
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body).toHaveProperty('periodo');
    expect(body).toHaveProperty('resumen');
    expect(body).toHaveProperty('ordenes_por_estado');
    expect(body).toHaveProperty('calidad');
    expect(body).toHaveProperty('avance_global');
    expect(body).toHaveProperty('perdidas_materia_prima');
    expect(body).toHaveProperty('incidencias');
  });

  it('rechaza con 400 cuando "desde" es posterior a "hasta"', async () => {
    const res = await consultarMetricas('desde=2026-11-20&hasta=2026-11-01', 'supervisor');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('rango de fechas es inválido');
  });

  it('acepta parámetros de fecha válidos y responde 200', async () => {
    const res = await consultarMetricas('desde=2026-10-01&hasta=2026-10-31', 'supervisor');
    expect(res.status).toBe(200);
    expect(res.body.periodo).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-31',
    });
  });
});

describe('Dashboard HTTP (ABC-495): metas de KPI y semáforo', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const queryMock = jest.fn();

  const CUENTAS_KPI: Record<string, unknown> = {
    supervisor: { id: '42', rol: 'Supervisor', permisos: ['ordenes.consultar', 'kpis.metas.gestionar'] },
    soloConsulta: { id: '43', rol: 'Encargado', permisos: ['ordenes.consultar'] },
    sinPermiso: { id: '99', rol: 'Operario', permisos: ['otras.operaciones'] },
  };

  const fila = (extra: Record<string, unknown> = {}) => ({
    kpi: 'FPY',
    meta: '95.0000',
    unidad: '%',
    umbral_amarillo_pct: '10.00',
    umbral_rojo_pct: '20.00',
    sentido: 'MAYOR_ES_MEJOR',
    actualizado_por: null,
    actualizado_en: new Date('2026-11-20T10:00:00Z'),
    ...extra,
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [DashboardService, PermisoProduccionGuard, { provide: DataSource, useValue: { query: queryMock } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (!url.toString().includes('/me')) return httpFetch(url, init);
      const token = (new Headers(init?.headers).get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const cuenta = CUENTAS_KPI[token];
      if (!cuenta) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify(cuenta), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    queryMock.mockResolvedValue([fila()]);
  });

  afterEach(() => jest.restoreAllMocks());

  async function llamar(metodo: string, ruta: string, cuenta: string | null, cuerpo?: unknown) {
    const res = await httpFetch(`${base}${ruta}`, {
      method: metodo,
      headers: {
        ...(cuenta ? { Authorization: `Bearer ${cuenta}` } : {}),
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  const cuerpoValido = { meta: 90, umbralAmarilloPct: 10, umbralRojoPct: 20 };

  it('GET /dashboard/kpis/metas responde 200 al supervisor', async () => {
    const res = await llamar('GET', '/dashboard/kpis/metas', 'soloConsulta');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ kpi: 'FPY', meta: 95 });
  });

  it('GET /dashboard/kpis/metas rechaza con 401 sin sesión y 403 sin permiso', async () => {
    expect((await llamar('GET', '/dashboard/kpis/metas', null)).status).toBe(401);
    expect((await llamar('GET', '/dashboard/kpis/metas', 'sinPermiso')).status).toBe(403);
  });

  it('GET /dashboard/kpis/metas/:kpi responde 404 si el KPI no existe', async () => {
    expect((await llamar('GET', '/dashboard/kpis/metas/NO_EXISTE', 'soloConsulta')).status).toBe(404);
  });

  it('GET /dashboard/kpis devuelve los KPIs sin color si no hay valor', async () => {
    const res = await llamar('GET', '/dashboard/kpis', 'soloConsulta');
    expect(res.status).toBe(200);
    expect(res.body.kpis[0]).toMatchObject({ kpi: 'FPY', valor: null, color: null });
  });

  it('PUT guarda la meta cuando el supervisor tiene permiso', async () => {
    queryMock.mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([fila({ meta: '90.0000', actualizado_por: '42' })]);
    const res = await llamar('PUT', '/dashboard/kpis/metas/FPY', 'supervisor', cuerpoValido);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kpi: 'FPY', meta: 90, actualizadoPor: 42 });
    expect(queryMock.mock.calls[0][1]).toEqual(['FPY', 90, 10, 20, 42]);
  });

  it('PUT rechaza con 403 a quien solo puede consultar', async () => {
    const res = await llamar('PUT', '/dashboard/kpis/metas/FPY', 'soloConsulta', cuerpoValido);
    expect(res.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('PUT rechaza con 401 sin sesión', async () => {
    expect((await llamar('PUT', '/dashboard/kpis/metas/FPY', null, cuerpoValido)).status).toBe(401);
  });

  it.each([
    ['umbral rojo menor al amarillo', { meta: 90, umbralAmarilloPct: 20, umbralRojoPct: 10 }],
    ['meta negativa', { meta: -1, umbralAmarilloPct: 10, umbralRojoPct: 20 }],
    ['meta ausente', { umbralAmarilloPct: 10, umbralRojoPct: 20 }],
    ['campo no permitido (sentido)', { ...cuerpoValido, sentido: 'MENOR_ES_MEJOR' }],
  ])('PUT responde 400: %s', async (_nombre, cuerpo) => {
    const res = await llamar('PUT', '/dashboard/kpis/metas/FPY', 'supervisor', cuerpo);
    expect(res.status).toBe(400);
  });

  it('PUT responde 404 si el KPI no existe', async () => {
    expect((await llamar('PUT', '/dashboard/kpis/metas/NO_EXISTE', 'supervisor', cuerpoValido)).status).toBe(404);
  });
});
