import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { ConsumoMaterial } from './entities/consumo-material.entity';
import { ConsumosMaterialController } from './consumos-material.controller';
import { ConsumosMaterialService } from './consumos-material.service';

describe('ABC-71: API protegida de consumos', () => {
  let app: INestApplication;
  let base: string;
  let permisos: string[];
  const httpFetch = global.fetch;
  const manager = { findOne: jest.fn(), save: jest.fn() };
  const repository = { find: jest.fn(), createQueryBuilder: jest.fn() };
  const references = { existsBy: jest.fn() };
  const transaction = jest.fn(async (callback) => callback(manager));
  const body = { ordenId: 1, materialId: 1, cantidad: 10, unidad: 'kg' };
  const query: Record<string, jest.Mock> = {};

  beforeAll(async () => {
    for (const method of ['select', 'addSelect', 'where', 'groupBy', 'addGroupBy', 'orderBy', 'addOrderBy', 'andWhere']) {
      query[method] = jest.fn(() => query);
    }
    query.getRawMany = jest.fn();
    const module = await Test.createTestingModule({
      controllers: [ConsumosMaterialController],
      providers: [ConsumosMaterialService, PermisoProduccionGuard,
        { provide: getRepositoryToken(ConsumoMaterial), useValue: repository },
        { provide: DataSource, useValue: { transaction, getRepository: () => references } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permisos = ['materiales.registrar_consumo', 'ordenes.consultar'];
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Encargado de Producción', permisos,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === OrdenProduccion) return { id: 1, producto_id: 5 };
      if (entity === Material) return { id: 1, unidadMedida: 'kg' };
      if (entity === RecetaMaterial) return { recetaId: 5, materialId: 1 };
      return null;
    });
    manager.save.mockImplementation(async (_entity, data) => ({ id: '1', ...data, fechaHora: new Date() }));
    references.existsBy.mockResolvedValue(true);
    repository.find.mockResolvedValue([]);
    repository.createQueryBuilder.mockReturnValue(query);
    query.getRawMany.mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await app.close(); });

  async function request(path = '', method = 'POST', data: unknown = body, autorizado = true) {
    const response = await httpFetch(`${base}/consumos-material${path}`, {
      method, headers: { ...(autorizado ? { Authorization: 'Bearer prueba' } : {}), 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  it('201: crea un consumo con usuario y fecha del servidor', async () => {
    const result = await request();
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ ordenId: '1', materialId: '1', cantidad: '10', usuarioRegistroId: '42' });
    expect(Number.isNaN(Date.parse(result.body.fechaHora))).toBe(false);
    expect(manager.save).toHaveBeenCalledWith(ConsumoMaterial, {
      ordenId: '1', materialId: '1', cantidad: '10', unidad: 'kg', usuarioRegistroId: '42',
    });
    expect(manager.findOne).toHaveBeenCalledWith(RecetaMaterial, expect.objectContaining({ where: { recetaId: 5, materialId: 1 } }));
  });

  it.each([0, -1, 0.00001, 1.12345, '10', null])('400: rechaza cantidad %s', async (cantidad) => {
    expect((await request('', 'POST', { ...body, cantidad })).status).toBe(400);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each(['usuarioRegistroId', 'fechaHora', 'id'])('400: rechaza el campo reservado %s', async (campo) => {
    expect((await request('', 'POST', { ...body, [campo]: 'falsificado' })).status).toBe(400);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([OrdenProduccion, Material])('404: referencia inexistente %s', async (inexistente) => {
    manager.findOne.mockImplementation(async (entity) => entity === inexistente ? null : { id: 1, producto_id: 5, unidadMedida: 'kg' });
    expect((await request()).status).toBe(404);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('400: material existente fuera de la receta de la orden', async () => {
    manager.findOne.mockImplementation(async (entity) => entity === RecetaMaterial ? null : { id: 1, producto_id: 5, unidadMedida: 'kg' });
    expect((await request()).status).toBe(400);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('400: unidad distinta de la del material', async () => {
    expect((await request('', 'POST', { ...body, unidad: 'g' })).status).toBe(400);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('403: permisos de solicitud o avance no permiten registrar consumo', async () => {
    permisos = ['materiales.solicitar', 'ordenes.registrar_avance', 'ordenes.consultar'];
    expect((await request()).status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('401: exige autenticacion', async () => {
    expect((await request('', 'POST', body, false)).status).toBe(401);
  });

  it('200: consulta registros y totales con filtro por material', async () => {
    permisos = ['ordenes.consultar'];
    const consumo = { id: '1', cantidad: '10.0000' };
    repository.find.mockResolvedValue([consumo]);
    query.getRawMany.mockResolvedValue([{ ordenId: '1', materialId: '2', cantidadTotal: '23.0000', unidad: 'kg' }]);
    expect(await request('/orden/1?materialId=2', 'GET')).toEqual({ status: 200, body: [consumo] });
    expect((await request('/orden/1/totales?materialId=2', 'GET')).status).toBe(200);
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ where: { ordenId: '1', materialId: '2' } }));
    expect(query.andWhere).toHaveBeenCalledWith('consumo.materialId = :materialId', { materialId: '2' });
  });

  it('403: registrar consumo no concede permiso de lectura', async () => {
    permisos = ['materiales.registrar_consumo'];
    expect((await request('/orden/1', 'GET')).status).toBe(403);
    expect((await request('/orden/1/totales', 'GET')).status).toBe(403);
  });

  it.each(['/orden/abc', '/orden/0', '/orden/1?materialId=abc', '/orden/1/totales?materialId=-1'])('400: consulta invalida %s', async (path) => {
    expect((await request(path, 'GET')).status).toBe(400);
  });

  it('404: consulta una orden inexistente', async () => {
    references.existsBy.mockResolvedValue(false);
    expect((await request('/orden/999', 'GET')).status).toBe(404);
    expect((await request('/orden/999/totales', 'GET')).status).toBe(404);
  });
});
