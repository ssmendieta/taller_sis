import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { SolicitudMaterial } from './entities/solicitud-material.entity';
import { SolicitudMaterialItem } from './entities/solicitud-material-item.entity';
import { SolicitudesMaterialController } from './solicitudes-material.controller';
import { SolicitudesMaterialService } from './solicitudes-material.service';

describe('ABC-73: solicitudes de material por HTTP', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const manager = { findOne: jest.fn(), save: jest.fn() };
  const repository = { find: jest.fn(), findOne: jest.fn() };
  const transaction = jest.fn(async (callback) => callback(manager));
  let permisos: string[];
  const body = { ordenId: 1, items: [{ materialId: 1, cantidad: 2.125, unidad: 'kg' }] };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SolicitudesMaterialController],
      providers: [SolicitudesMaterialService, PermisoProduccionGuard,
        { provide: getRepositoryToken(SolicitudMaterial), useValue: repository },
        { provide: DataSource, useValue: { transaction } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permisos = ['materiales.solicitar', 'materiales.consultar_disponibilidad'];
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Encargado de Producción', permisos,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    manager.findOne.mockImplementation(async (entity) => {
      if (entity === OrdenProduccion) return { id: 1 };
      if (entity === Material) return { id: 1, unidadMedida: 'kg' };
      return null;
    });
    manager.save.mockImplementation(async (entity, data) => entity === SolicitudMaterial
      ? { id: '1', fecha: new Date(), ...data }
      : data.map((item, index) => ({ id: String(index + 1), ...item })));
    repository.find.mockResolvedValue([]);
    repository.findOne.mockResolvedValue(null);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await app.close(); });

  async function request(path = '', method = 'POST', data: unknown = body) {
    const response = await httpFetch(`${base}/solicitudes-material${path}`, {
      method, headers: { Authorization: 'Bearer prueba', 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  it('201: crea varios items con el actor autenticado y estado PENDIENTE', async () => {
    const result = await request('', 'POST', { ...body, items: [...body.items, { materialId: 2, cantidad: 1, unidad: 'kg' }] });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ solicitanteUsuarioId: '42', estado: 'PENDIENTE' });
    expect(result.body.items).toHaveLength(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenCalledWith(OrdenProduccion, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });

  it.each([0, -1, 0.00001, 1.12345, '2', null])('400: rechaza cantidad %s', async (cantidad) => {
    expect((await request('', 'POST', { ...body, items: [{ ...body.items[0], cantidad }] })).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('400: rechaza solicitud sin items', async () => {
    expect((await request('', 'POST', { ordenId: 1, items: [] })).status).toBe(400);
  });

  it.each(['estado', 'solicitanteUsuarioId', 'fecha'])('400: no acepta %s del body', async (campo) => {
    expect((await request('', 'POST', { ...body, [campo]: 'dato falsificado' })).status).toBe(400);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('400: rechaza unidad que no corresponde al material', async () => {
    expect((await request('', 'POST', { ...body, items: [{ ...body.items[0], unidad: 'g' }] })).status).toBe(400);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([OrdenProduccion, Material])('404: rechaza referencia inexistente (%s)', async (inexistente) => {
    manager.findOne.mockImplementation(async (entity) => entity === inexistente ? null : { id: 1, unidadMedida: 'kg' });
    expect((await request()).status).toBe(404);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('403: rechaza creacion sin materiales.solicitar', async () => {
    permisos = ['materiales.consultar_disponibilidad'];
    expect((await request()).status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['PENDIENTE', 'APROBADA'])('409: rechaza duplicado abierto %s', async (estado) => {
    manager.findOne.mockImplementation(async (entity, options) => {
      if (entity === OrdenProduccion) return { id: 1 };
      if (entity === Material) return { id: 1, unidadMedida: 'kg' };
      expect(options.where.solicitud.estado.value).toEqual(['PENDIENTE', 'APROBADA']);
      return { id: '9', solicitud: { estado } };
    });
    expect((await request()).status).toBe(409);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('409: rechaza material repetido en el body', async () => {
    expect((await request('', 'POST', { ...body, items: [body.items[0], body.items[0]] })).status).toBe(409);
  });

  it('200: lista y devuelve detalle con el permiso de consulta', async () => {
    permisos = ['materiales.consultar_disponibilidad'];
    const solicitud = { id: '1', items: [{ materialId: '1' }] };
    repository.find.mockResolvedValue([solicitud]);
    repository.findOne.mockResolvedValue(solicitud);
    expect(await request('', 'GET')).toEqual({ status: 200, body: [solicitud] });
    expect(await request('/1', 'GET')).toEqual({ status: 200, body: solicitud });
  });

  it('403: bloquea listado y detalle sin permiso de consulta', async () => {
    permisos = ['materiales.solicitar'];
    expect((await request('', 'GET')).status).toBe(403);
    expect((await request('/1', 'GET')).status).toBe(403);
  });

  it('404: detalle inexistente; 400: id invalido', async () => {
    expect((await request('/999', 'GET')).status).toBe(404);
    expect((await request('/abc', 'GET')).status).toBe(400);
    expect((await request('/9223372036854775808', 'GET')).status).toBe(400);
  });
});
