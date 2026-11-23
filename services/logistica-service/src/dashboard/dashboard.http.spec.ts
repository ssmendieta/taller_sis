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

  it('ABC-512: GET /dashboard/kpis/:kpi/detalle exige permiso, valida el KPI y responde', async () => {
    const pedir = (ruta: string, token?: string) =>
      httpFetch(`${base}/dashboard/kpis/${ruta}`, token ? { headers: { authorization: `Bearer ${token}` } } : {});
    queryMock.mockResolvedValue([]);
    expect((await pedir('USO_CAPACIDAD/detalle')).status).toBe(401);
    expect((await pedir('USO_CAPACIDAD/detalle', 'operadorSinPermiso')).status).toBe(403);
    expect((await pedir('NO_EXISTE/detalle', 'encargadoLogistica')).status).toBe(404);
    expect((await pedir('USO_CAPACIDAD/detalle?otro=1', 'encargadoLogistica')).status).toBe(400);
    const res = await pedir('USO_CAPACIDAD/detalle?desde=2026-01-01', 'encargadoLogistica');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kpi: 'USO_CAPACIDAD', valor: null, registros: [] });
  });

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
    expect(body.uso_capacidad).toEqual({
      porcentaje: null, rutas_calculables: 0, rutas_no_calculables: 0, por_vehiculo: [], por_ruta: [],
    });
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

  it('ABC-478: publica horas y sin datos como null, sin confundirlo con cero', async () => {
    const vacio = await consultarMetricas();
    expect(vacio.body.tiempo_atencion).toEqual({ promedio_horas: null, solicitudes_entregadas: 0, unidad: 'horas' });
    queryMock.mockImplementation(async (sql: string) => sql.includes('WITH entregas_por_boleta')
      ? [{ promedio_horas: '12.50', solicitudes_entregadas: 2 }] : []);
    const res = await consultarMetricas('desde=2026-11-01&hasta=2026-11-20');
    expect(res.status).toBe(200);
    expect(res.body.tiempo_atencion).toEqual({ promedio_horas: 12.5, solicitudes_entregadas: 2, unidad: 'horas' });
  });
});

describe('Dashboard HTTP (ABC-495): metas de KPI y semáforo', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const queryMock = jest.fn();

  const CUENTAS_KPI: Record<string, unknown> = {
    supervisor: { id: '42', rol: 'Supervisor', permisos: ['logistica.rutas.consultar', 'kpis.metas.gestionar'] },
    soloConsulta: { id: '43', rol: 'Encargado', permisos: ['logistica.rutas.consultar'] },
    sinPermiso: { id: '99', rol: 'Operario', permisos: ['otras.operaciones'] },
  };

  const fila = (extra: Record<string, unknown> = {}) => ({
    kpi: 'ENTREGAS_A_TIEMPO',
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
      providers: [DashboardService, PermisoLogisticaGuard, { provide: DataSource, useValue: { query: queryMock } }],
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
    expect(res.body[0]).toMatchObject({ kpi: 'ENTREGAS_A_TIEMPO', meta: 95 });
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
    expect(res.body.kpis[0]).toMatchObject({ kpi: 'ENTREGAS_A_TIEMPO', valor: null, color: null });
  });

  it('PUT guarda la meta cuando el supervisor tiene permiso', async () => {
    queryMock.mockResolvedValueOnce([[], 1]).mockResolvedValueOnce([fila({ meta: '90.0000', actualizado_por: '42' })]);
    const res = await llamar('PUT', '/dashboard/kpis/metas/ENTREGAS_A_TIEMPO', 'supervisor', cuerpoValido);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ kpi: 'ENTREGAS_A_TIEMPO', meta: 90, actualizadoPor: 42 });
    expect(queryMock.mock.calls[0][1]).toEqual(['ENTREGAS_A_TIEMPO', 90, 10, 20, 42]);
  });

  it('PUT rechaza con 403 a quien solo puede consultar', async () => {
    const res = await llamar('PUT', '/dashboard/kpis/metas/ENTREGAS_A_TIEMPO', 'soloConsulta', cuerpoValido);
    expect(res.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('PUT rechaza con 401 sin sesión', async () => {
    expect((await llamar('PUT', '/dashboard/kpis/metas/ENTREGAS_A_TIEMPO', null, cuerpoValido)).status).toBe(401);
  });

  it.each([
    ['umbral rojo menor al amarillo', { meta: 90, umbralAmarilloPct: 20, umbralRojoPct: 10 }],
    ['meta negativa', { meta: -1, umbralAmarilloPct: 10, umbralRojoPct: 20 }],
    ['meta ausente', { umbralAmarilloPct: 10, umbralRojoPct: 20 }],
    ['campo no permitido (sentido)', { ...cuerpoValido, sentido: 'MENOR_ES_MEJOR' }],
  ])('PUT responde 400: %s', async (_nombre, cuerpo) => {
    const res = await llamar('PUT', '/dashboard/kpis/metas/ENTREGAS_A_TIEMPO', 'supervisor', cuerpo);
    expect(res.status).toBe(400);
  });

  it('PUT responde 404 si el KPI no existe', async () => {
    expect((await llamar('PUT', '/dashboard/kpis/metas/NO_EXISTE', 'supervisor', cuerpoValido)).status).toBe(404);
  });
});
