import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { ConsumosMaterialService } from '../consumos-material/consumos-material.service';
import { MaterialCalculationService } from '../material-calculation/material-calculation.service';
import { OrdenesController } from './ordenes.controller';
import { OrdenesService } from './ordenes.service';

describe('ABC-72: API protegida de comparacion por orden', () => {
  let app: INestApplication;
  let base: string;
  let permisos: string[];
  const httpFetch = global.fetch;
  const existsBy = jest.fn();
  const getRawMany = jest.fn();
  const totales = jest.fn();
  const query = {
    innerJoin: jest.fn(() => query), select: jest.fn(() => query), addSelect: jest.fn(() => query),
    where: jest.fn(() => query), orderBy: jest.fn(() => query), getRawMany,
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrdenesController],
      providers: [MaterialCalculationService, PermisoProduccionGuard,
        { provide: OrdenesService, useValue: {} },
        { provide: ConsumosMaterialService, useValue: { totales } },
        { provide: DataSource, useValue: { getRepository: () => ({ existsBy, createQueryBuilder: () => query }) } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permisos = ['ordenes.consultar'];
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Encargado de Produccion', permisos,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    existsBy.mockResolvedValue(true);
    getRawMany.mockResolvedValue([{
      materialId: '1', materialCodigo: 'M1', materialNombre: 'Harina', unidad: 'kg', cantidadRequerida: '20.00000000',
    }]);
    totales.mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await app?.close(); });

  async function request(id = '1', autenticado = true) {
    const response = await httpFetch(`${base}/ordenes/${id}/comparacion-materiales`, {
      headers: autenticado ? { Authorization: 'Bearer prueba' } : {},
    });
    return { status: response.status, body: await response.json() };
  }

  it('200: sin consumos devuelve requerido, utilizado cero, diferencia y unidad', async () => {
    expect(await request()).toEqual({ status: 200, body: { ordenId: '1', materiales: [{
      materialId: '1', materialCodigo: 'M1', materialNombre: 'Harina', unidad: 'kg',
      cantidadRequerida: '20.0000', cantidadConsumida: '0.0000', diferencia: '-20.0000',
    }] } });
    expect(totales).toHaveBeenCalledWith(1);
  });

  it('200: devuelve los totales de ABC-71 sin recalcularlos en el controlador', async () => {
    totales.mockResolvedValue([{ ordenId: '1', materialId: '1', unidad: 'kg', cantidadTotal: '23.0000' }]);
    const result = await request();
    expect(result.status).toBe(200);
    expect(result.body.materiales[0]).toMatchObject({ cantidadRequerida: '20.0000', cantidadConsumida: '23.0000', diferencia: '3.0000', unidad: 'kg' });
  });

  it('404: orden inexistente conserva el error del servicio', async () => {
    existsBy.mockResolvedValue(false);
    const result = await request('999');
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ statusCode: 404, message: 'Orden con id 999 no encontrada' });
    expect(totales).not.toHaveBeenCalled();
  });

  it('403: otros permisos de materiales no conceden lectura de la orden', async () => {
    permisos = ['materiales.calcular', 'materiales.registrar_consumo'];
    const result = await request();
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ statusCode: 403, message: 'No tiene permisos para esta operación' });
    expect(existsBy).not.toHaveBeenCalled();
    expect(totales).not.toHaveBeenCalled();
  });

  it('401: requiere autenticacion', async () => {
    expect((await request('1', false)).status).toBe(401);
    expect(existsBy).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1', '1.5', '9007199254740992'])('400: id invalido %s', async (id) => {
    expect((await request(id)).status).toBe(400);
    expect(totales).not.toHaveBeenCalled();
  });

  it('409: no compara unidades incompatibles', async () => {
    totales.mockResolvedValue([{ materialId: '1', unidad: 'g', cantidadTotal: '23.0000' }]);
    const result = await request();
    expect(result.status).toBe(409);
    expect(result.body.statusCode).toBe(409);
  });
});
