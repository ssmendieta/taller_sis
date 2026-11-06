import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { ReportesModule } from './reportes.module';
import { ReportesService } from './reportes.service';

// PRUEBA SIMULADA: Auth es un servidor HTTP local y el servicio del reporte es un
// doble; el controlador, el pipe de filtros y el guard de permisos son los reales.
describe('ABC-340: GET /reportes/logistica (permisos y filtros)', () => {
  const authOriginal = process.env.AUTH_SERVICE_URL;
  let auth: Server;
  let app: INestApplication;
  let base: string;
  let permisos: string[];
  const generar = jest.fn(async (filtros: unknown) => ({ filtros, rutas: [], boletas: [] }));

  beforeAll(async () => {
    auth = createServer((req, res) => {
      const sesion = req.headers.authorization === 'Bearer sesion-de-prueba';
      res.writeHead(sesion ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sesion ? { id: '42', permisos: permisos.map((codigo) => ({ codigo })) } : { message: 'Sesión inválida' }));
    });
    await new Promise<void>((resolver) => auth.listen(0, '127.0.0.1', resolver));
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(auth.address() as AddressInfo).port}`;
    const modulo = await Test.createTestingModule({ imports: [ReportesModule] })
      .overrideProvider(ReportesService).useValue({ generar })
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    auth.closeAllConnections();
    await new Promise((resolver) => auth.close(resolver));
    if (authOriginal === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = authOriginal;
  });

  beforeEach(() => {
    permisos = ['logistica.rutas.consultar'];
    generar.mockClear();
  });

  async function consultar(parametros: string, sesion = true) {
    const respuesta = await fetch(`${base}/reportes/logistica${parametros}`, {
      headers: sesion ? { Authorization: 'Bearer sesion-de-prueba' } : {},
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }

  it('200 con logistica.rutas.consultar; pasa filtros normalizados y la sesión', async () => {
    const { status, body } = await consultar('?fechaDesde=2026-11-01&fechaHasta=2026-11-30&estadoRuta=COMPLETADA&estadoBoleta=ANULADA');
    expect(status).toBe(200);
    expect(body.filtros).toEqual({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estadoRuta: 'COMPLETADA', estadoBoleta: 'ANULADA' });
    expect(generar).toHaveBeenCalledWith(body.filtros, 'Bearer sesion-de-prueba');
  });

  it('sin estados devuelve null en esos filtros', async () => {
    const { body } = await consultar('?fechaDesde=2026-11-01&fechaHasta=2026-11-01');
    expect(body.filtros).toEqual({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-01', estadoRuta: null, estadoBoleta: null });
  });

  it('401 sin sesión y 403 sin el permiso, sin generar el reporte', async () => {
    expect((await consultar('?fechaDesde=2026-11-01&fechaHasta=2026-11-30', false)).status).toBe(401);
    permisos = ['logistica.boletas.consultar'];
    expect((await consultar('?fechaDesde=2026-11-01&fechaHasta=2026-11-30')).status).toBe(403);
    expect(generar).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'fechaDesde y fechaHasta son obligatorias'],
    ['?fechaDesde=2026-11-01', 'fechaDesde y fechaHasta son obligatorias'],
    ['?fechaDesde=2026-02-30&fechaHasta=2026-03-01', 'fechaDesde y fechaHasta son obligatorias'],
    ['?fechaDesde=2026-12-01&fechaHasta=2026-11-01', 'fechaDesde no puede ser posterior a fechaHasta'],
    ['?fechaDesde=2025-01-01&fechaHasta=2026-01-02', 'El período no puede superar 366 días'],
    ['?fechaDesde=2026-11-01&fechaHasta=2026-11-30&estadoRuta=EN_CAMINO', 'estadoRuta debe ser uno de: PLANIFICADA, DESPACHADA, COMPLETADA, CANCELADA'],
    ['?fechaDesde=2026-11-01&fechaHasta=2026-11-30&estadoBoleta=PAGADA', 'estadoBoleta debe ser uno de: BORRADOR, EMITIDA, ANULADA'],
    ['?fechaDesde=2026-11-01&fechaHasta=2026-11-30&chofer=CHO-1', 'Parámetro de consulta no permitido: chofer'],
    ['?fechaDesde=2026-11-01&fechaDesde=2026-11-02&fechaHasta=2026-11-30', 'fechaDesde debe enviarse una sola vez'],
  ])('400 %s', async (parametros, mensaje) => {
    const { status, body } = await consultar(parametros);
    expect(status).toBe(400);
    expect(body.message).toContain(mensaje);
    expect(generar).not.toHaveBeenCalled();
  });

  it('acepta exactamente 366 días (año bisiesto completo)', async () => {
    expect((await consultar('?fechaDesde=2028-01-01&fechaHasta=2028-12-31')).status).toBe(200);
  });
});
