import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { MaterialCalculationService } from '../material-calculation/material-calculation.service';
import { OrdenesController } from './ordenes.controller';
import { OrdenesService } from './ordenes.service';

describe('ABC-113: permisos de disponibilidad por HTTP', () => {
  const httpFetch = global.fetch.bind(global);
  let app: INestApplication;
  let base: string;
  let permisos: string[];
  const solicitar = jest.fn();
  const consultar = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [OrdenesController], providers: [
      PermisoProduccionGuard,
      { provide: OrdenesService, useValue: { solicitarDisponibilidadMateriales: solicitar, compararDisponibilidadMateriales: consultar } },
      { provide: MaterialCalculationService, useValue: {} },
    ] }).compile();
    app = module.createNestApplication(); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  });
  beforeEach(() => {
    jest.clearAllMocks(); permisos = ['ordenes.consultar', 'materiales.consultar_disponibilidad'];
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: '42', rol: 'Encargado de Producción', permisos }), { status: 200 }));
    solicitar.mockResolvedValue({ orden_id: 15, estado_consulta: 'PENDIENTE', consulta_id: 'DISP-ORD-15-V1' });
    consultar.mockResolvedValue({ orden_id: 15, estado_consulta: 'RESPONDIDA', materiales: [{ material_id: 8, cantidad_disponible: 2, unidad_medida: 'kg', estado: 'SUFICIENTE' }] });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => app?.close());
  function request(method = 'POST', token = true, id = '15') {
    return httpFetch(`${base}/ordenes/${id}/disponibilidad-materiales${method === 'POST' ? '/consultar' : ''}`, {
      method, headers: token ? { Authorization: 'Bearer prueba' } : {},
    });
  }
  it('202: solicita sin devolver éxito de Inventarios anticipado', async () => {
    const r = await request(); expect(r.status).toBe(202);
    expect(await r.json()).toMatchObject({ estado_consulta: 'PENDIENTE' });
    expect(solicitar).toHaveBeenCalledWith(15);
  });
  it('200: lee las cantidades recibidas de Inventarios', async () => {
    const r = await request('GET'); expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ estado_consulta: 'RESPONDIDA', materiales: [{ cantidad_disponible: 2, unidad_medida: 'kg' }] });
  });
  it.each(['POST', 'GET'])('401 sin sesión en %s', async method => {
    expect((await request(method, false)).status).toBe(401);
    expect(solicitar).not.toHaveBeenCalled(); expect(consultar).not.toHaveBeenCalled();
  });
  it.each(['POST', 'GET'])('403 sin el permiso correspondiente en %s', async method => {
    permisos.length = 0;
    // Cada validación obtiene una respuesta nueva de Auth, con los permisos vigentes.
    jest.mocked(global.fetch).mockImplementation(async () => new Response(JSON.stringify({ id: '42', rol: 'Encargado de Producción', permisos }), { status: 200 }));
    expect((await request(method)).status).toBe(403);
    expect(solicitar).not.toHaveBeenCalled(); expect(consultar).not.toHaveBeenCalled();
  });
  it('404 para una orden inexistente', async () => {
    solicitar.mockRejectedValue(new NotFoundException('Orden 999 no encontrada'));
    const r = await request('POST', true, '999'); expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ message: 'Orden 999 no encontrada' });
  });
});
