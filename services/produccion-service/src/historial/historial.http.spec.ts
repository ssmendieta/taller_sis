import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';

describe('ABC-332: contrato HTTP y permisos', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const listarOrdenes = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HistorialController],
      providers: [PermisoProduccionGuard, { provide: HistorialService, useValue: { listarOrdenes } },
        { provide: getRepositoryToken(OrdenProduccion), useValue: {} }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    listarOrdenes.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '7', rol: 'Personalizado', permisos: ['ordenes.consultar'],
    }), { status: 200 }));
  });
  afterEach(() => { jest.restoreAllMocks(); });

  const consultar = (query = '', token: string | null = 'token') => httpFetch(`${base}/historial/ordenes${query ? `?${query}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  it('rechaza sin sesion antes de consultar datos', async () => {
    expect((await consultar('', null)).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(listarOrdenes).not.toHaveBeenCalled();
  });
  it('rechaza sesiones invalidadas por Auth', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response('{}', { status: 401 }));
    expect((await consultar()).status).toBe(401);
    expect(listarOrdenes).not.toHaveBeenCalled();
  });
  it('rechaza usuario sin ordenes.consultar', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ id: '7', permisos: ['ordenes.crear'] })));
    expect((await consultar()).status).toBe(403);
    expect(listarOrdenes).not.toHaveBeenCalled();
  });
  it('acepta cualquier rol con permiso y entrega resultado vacio con valores por defecto', async () => {
    const response = await consultar();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    expect(listarOrdenes).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });
  it('transforma filtros combinados antes de llamar al servicio', async () => {
    expect((await consultar('fechaDesde=2024-02-29&fechaHasta=2024-03-01&estado=FINALIZADA&producto=Pan&page=2&limit=5')).status).toBe(200);
    expect(listarOrdenes).toHaveBeenCalledWith({ fechaDesde: '2024-02-29', fechaHasta: '2024-03-01', estado: 'FINALIZADA', producto: 'Pan', page: 2, limit: 5 });
  });
  it.each([
    'fechaDesde=2025-02-29', 'fechaHasta=2026-04-31', 'fechaDesde=2026-13-01',
    'fechaDesde=0000-01-01', 'fechaDesde=ayer', 'fechaHasta=2026-11-01T12:00:00Z',
    'fechaDesde=2026-11-02&fechaHasta=2026-11-01', 'estado=DESCONOCIDO', 'estado=finalizada',
    'page=0', 'page=-1', 'page=1.5', 'page=1e2', 'page=9007199254740992',
    'page=9007199254740991&limit=100', 'limit=0', 'limit=101', 'limit=abc',
    'page=', 'producto=%20', 'producto=' + 'a'.repeat(151), 'estado=FINALIZADA&estado=CANCELADA',
    'fechaDesde=2026-01-01&fechaDesde=2026-01-02', 'page=1&page=2', 'extra=1',
  ])('rechaza consulta invalida: %s', async (query) => {
    expect((await consultar(query)).status).toBe(400);
    expect(listarOrdenes).not.toHaveBeenCalled();
  });
});
