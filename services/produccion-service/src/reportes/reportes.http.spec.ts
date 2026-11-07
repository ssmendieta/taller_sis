import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

describe('ABC-336: HTTP, validacion y acceso', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const produccion = jest.fn();
  const vacio = { filtros: { fechaDesde: null, fechaHasta: null, producto: null, campoFecha: 'fecha_programada' },
    ordenes: [], totales: { ordenes: 0, productos: [], consumos: [], perdidas: [] } };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReportesController],
      providers: [PermisoProduccionGuard, { provide: ReportesService, useValue: { produccion } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    produccion.mockReset().mockResolvedValue(vacio);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: '7', rol: 'Personalizado', permisos: ['ordenes.consultar'],
    })));
  });
  afterEach(() => { jest.restoreAllMocks(); });
  const consultar = (query = '', token: string | null = 'token') => httpFetch(`${base}/reportes/produccion?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  it('requiere sesion antes de consultar Auth o datos', async () => {
    expect((await consultar('', null)).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(produccion).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500])('propaga rechazo/fallo de Auth %s sin consultar datos', async (status) => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{}', { status }));
    expect((await consultar()).status).toBe(status === 500 ? 503 : status);
    expect(produccion).not.toHaveBeenCalled();
  });
  it('rechaza usuario sin permiso', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ id: '7', permisos: ['ordenes.crear'] })));
    expect((await consultar()).status).toBe(403);
    expect(produccion).not.toHaveBeenCalled();
  });
  it('acepta rol personalizado con ordenes.consultar y conserva el contrato', async () => {
    const response = await consultar();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(vacio);
  });
  it('valida fecha bisiesta y normaliza el texto del producto', async () => {
    expect((await consultar('fechaDesde=2024-02-29&fechaHasta=2024-02-29&producto=%20Pan%20')).status).toBe(200);
    expect(produccion).toHaveBeenCalledWith({ fechaDesde: '2024-02-29', fechaHasta: '2024-02-29', producto: 'Pan' });
  });
  it.each(['fechaDesde=2025-02-29', 'fechaHasta=2026-04-31', 'fechaDesde=0000-01-01',
    'fechaDesde=2026-13-01', 'fechaDesde=ayer', 'fechaHasta=2026-01-01T00:00:00Z',
    'fechaDesde=2026-11-02&fechaHasta=2026-11-01', 'fechaDesde=', 'producto=', 'producto=%20',
    'producto=' + 'a'.repeat(151), 'producto=pan&producto=gal', 'fechaDesde[x]=1',
    'fechaDesde=2026-01-01&fechaDesde=2026-01-02', 'page=1', 'limit=10', 'estado=FINALIZADA',
  ])('rechaza parametros invalidos: %s', async (query) => {
    expect((await consultar(query)).status).toBe(400);
    expect(produccion).not.toHaveBeenCalled();
  });
});
