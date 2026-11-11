import { BadRequestException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';

describe('ABC-334: consulta HTTP de eventos', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const detalleOrden = jest.fn();

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [HistorialController],
      providers: [PermisoProduccionGuard, { provide: HistorialService, useValue: { detalleOrden } }],
    }).compile();
    app = modulo.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    detalleOrden.mockReset().mockResolvedValue({
      orden: { id: 42, codigo: 'ORD-42', estado: 'PENDIENTE', unidadProducto: 'kg' }, eventos: [],
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: '7', permisos: ['ordenes.consultar'],
    })));
  });
  afterEach(() => jest.restoreAllMocks());

  const consultar = (id = '42', token: string | null = 'token') =>
    httpFetch(`${base}/historial/ordenes/${id}/eventos`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  it('exige una sesión válida antes de leer eventos', async () => {
    expect((await consultar('42', null)).status).toBe(401);
    expect(detalleOrden).not.toHaveBeenCalled();
  });
  it('rechaza una sesión sin permiso de consulta', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ id: '7', permisos: [] })));
    expect((await consultar()).status).toBe(403);
    expect(detalleOrden).not.toHaveBeenCalled();
  });
  it('devuelve la orden y su historial vacío para un usuario autorizado', async () => {
    const respuesta = await consultar();
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ orden: { id: 42 }, eventos: [] });
    expect(detalleOrden).toHaveBeenCalledWith(42);
  });
  it.each(['abc', '1.2', '1e2'])('rechaza el identificador no entero %s', async (id) => {
    expect((await consultar(id)).status).toBe(400);
    expect(detalleOrden).not.toHaveBeenCalled();
  });
  it('conserva el 404 de una orden inexistente', async () => {
    detalleOrden.mockRejectedValue(new NotFoundException('Orden de producción no encontrada'));
    expect((await consultar()).status).toBe(404);
  });
  it('conserva el 400 del identificador fuera de rango', async () => {
    detalleOrden.mockRejectedValue(new BadRequestException('Identificador inválido'));
    expect((await consultar('9007199254740992')).status).toBe(400);
  });
});
