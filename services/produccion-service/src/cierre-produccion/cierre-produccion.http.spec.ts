import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CierreProduccionController } from './cierre-produccion.controller';
import { CierreProduccionService } from './cierre-produccion.service';

describe('ABC-299: validacion y autorizacion de la API de cierre', () => {
  let app: INestApplication;
  let base: string;
  let permisos: string[];
  const httpFetch = global.fetch;
  const service = { preparar: jest.fn(), consultar: jest.fn() };
  const snapshot = { id: '7', ordenId: '1', cierreVersion: 1, cantidadProducida: '100.0000', cantidadConforme: '95.0000', cantidadDefectuosa: '5.0000', consumos: [] };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CierreProduccionController],
      providers: [PermisoProduccionGuard, { provide: CierreProduccionService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permisos = ['ordenes.finalizar_cancelar', 'ordenes.consultar'];
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Encargado de Produccion', permisos,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    service.preparar.mockResolvedValue(snapshot);
    service.consultar.mockResolvedValue(snapshot);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await app?.close(); });

  async function request(path = '', method = 'POST', data: unknown = { ordenId: 1 }, autenticado = true) {
    const response = await httpFetch(`${base}/cierres-produccion${path}`, {
      method, headers: { ...(autenticado ? { Authorization: 'Bearer prueba' } : {}), 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  it('201: preparar usa el permiso de cierre existente y version inicial 1', async () => {
    permisos = ['ordenes.finalizar_cancelar'];
    expect(await request()).toEqual({ status: 201, body: snapshot });
    expect(service.preparar).toHaveBeenCalledWith(expect.objectContaining({ ordenId: 1, cierreVersion: 1 }));
  });

  it('200: consultar usa el permiso de lectura existente y la version solicitada', async () => {
    permisos = ['ordenes.consultar'];
    expect(await request('/orden/1?cierreVersion=2', 'GET')).toEqual({ status: 200, body: snapshot });
    expect(service.consultar).toHaveBeenCalledWith(1, 2);
    await request('/orden/1', 'GET');
    expect(service.consultar).toHaveBeenLastCalledWith(1, 1);
  });

  it('403: consultar ordenes o registrar avances no autoriza preparar un cierre', async () => {
    permisos = ['ordenes.consultar', 'ordenes.registrar_avance'];
    expect((await request()).status).toBe(403);
    expect(service.preparar).not.toHaveBeenCalled();
  });

  it('403: finalizar no concede automaticamente el permiso de consulta', async () => {
    permisos = ['ordenes.finalizar_cancelar'];
    expect((await request('/orden/1', 'GET')).status).toBe(403);
    expect(service.consultar).not.toHaveBeenCalled();
  });

  it('401: las dos operaciones requieren sesion', async () => {
    expect((await request('', 'POST', { ordenId: 1 }, false)).status).toBe(401);
    expect((await request('/orden/1', 'GET', undefined, false)).status).toBe(401);
    expect(service.preparar).not.toHaveBeenCalled();
    expect(service.consultar).not.toHaveBeenCalled();
  });

  it.each([
    {}, { ordenId: 0 }, { ordenId: '1' }, { ordenId: 9007199254740992 },
    { ordenId: 1, cierreVersion: 0 }, { ordenId: 1, cierreVersion: null },
    { ordenId: 1, cierreVersion: 1.5 }, { ordenId: 1, cierreVersion: 2147483648 },
  ])('400: datos de preparacion invalidos %j', async (data) => {
    expect((await request('', 'POST', data)).status).toBe(400);
    expect(service.preparar).not.toHaveBeenCalled();
  });

  it.each(['cantidadProducida', 'cantidadConforme', 'cantidadDefectuosa', 'consumos', 'fechaCierre', 'producto'])('400: no acepta %s del body', async (campo) => {
    expect((await request('', 'POST', { ordenId: 1, [campo]: 'falsificado' })).status).toBe(400);
    expect(service.preparar).not.toHaveBeenCalled();
  });

  it.each(['/orden/abc', '/orden/0', '/orden/1?cierreVersion=0', '/orden/1?cierreVersion=abc', '/orden/1?extra=1'])('400: consulta invalida %s', async (path) => {
    expect((await request(path, 'GET')).status).toBe(400);
    expect(service.consultar).not.toHaveBeenCalled();
  });
});
