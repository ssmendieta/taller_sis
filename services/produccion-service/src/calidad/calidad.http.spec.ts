import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { CalidadController } from './calidad.controller';
import { CalidadService } from './calidad.service';
import { ResultadoConforme } from './entities/resultado-conforme.entity';

describe('ABC-82: conformes por HTTP', () => {
  let app: INestApplication;
  let base: string;
  let permisos: string[];
  let producido: string;
  let conforme: string;
  const httpFetch = global.fetch;
  const referencias = { existsBy: jest.fn() };
  const resultados = { find: jest.fn() };
  const manager = { findOne: jest.fn(), getRepository: jest.fn(), save: jest.fn() };
  const transaction = jest.fn(async (callback) => callback(manager));
  const body = { ordenId: 1, cantidad: 10 };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CalidadController],
      providers: [CalidadService, PermisoProduccionGuard,
        { provide: getRepositoryToken(ResultadoConforme), useValue: resultados },
        { provide: DataSource, useValue: { transaction, getRepository: () => referencias } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    permisos = ['calidad.registrar_conformes', 'ordenes.consultar'];
    producido = '23.0000';
    conforme = '0.0000';
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Encargado de Producción', permisos,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    manager.findOne.mockResolvedValue({ id: 1 });
    manager.getRepository.mockImplementation((entity) => ({
      createQueryBuilder: () => {
        const query = {
          select: jest.fn(() => query), where: jest.fn(() => query),
          getRawOne: jest.fn(async () => ({ total: entity === AvancesProduccion ? producido : conforme })),
        };
        return query;
      },
    }));
    manager.save.mockImplementation(async (_entity, data) => ({ id: '1', ...data, fechaHora: new Date() }));
    referencias.existsBy.mockResolvedValue(true);
    resultados.find.mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await app.close(); });

  async function request(path = '', method = 'POST', data: unknown = body, token = true) {
    const response = await httpFetch(`${base}/calidad/conformes${path}`, {
      method, headers: { ...(token ? { Authorization: 'Bearer prueba' } : {}), 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  it('201: registra conforme con responsable autenticado y fecha del servidor', async () => {
    const response = await request();
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ responsableUsuarioId: '42', cantidad: '10.0000' });
    expect(Number.isNaN(Date.parse(response.body.fechaHora))).toBe(false);
    expect(manager.findOne).toHaveBeenCalledWith(OrdenProduccion, { where: { id: 1 }, lock: { mode: 'pessimistic_write' } });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 0.00001, 1.12345, '10', null])('400: rechaza cantidad %s', async (cantidad) => {
    expect((await request('', 'POST', { ...body, cantidad })).status).toBe(400);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([{}, { ordenId: 1 }, { cantidad: 1 }, { ordenId: 0, cantidad: 1 }])('400: datos requeridos invalidos %s', async (data) => {
    expect((await request('', 'POST', data)).status).toBe(400);
  });

  it.each(['responsableUsuarioId', 'fechaHora'])('400: rechaza el campo reservado %s', async (campo) => {
    expect((await request('', 'POST', { ...body, [campo]: 'falsificado' })).status).toBe(400);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('409: rechaza exceso acumulado sin guardar', async () => {
    conforme = '14.0000';
    expect((await request()).status).toBe(409);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('409: no permite conformes sin avances', async () => {
    producido = '0';
    expect((await request()).status).toBe(409);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('404: orden inexistente', async () => {
    manager.findOne.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('403: permisos de avance o lectura no permiten registrar conformes', async () => {
    permisos = ['ordenes.registrar_avance', 'ordenes.consultar'];
    expect((await request()).status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('401: exige sesion', async () => {
    expect((await request('', 'POST', body, false)).status).toBe(401);
  });

  it('200: consulta conformes por orden', async () => {
    permisos = ['ordenes.consultar'];
    resultados.find.mockResolvedValue([{ id: '1', cantidad: '10.0000' }]);
    expect(await request('/orden/1', 'GET')).toEqual({ status: 200, body: [{ id: '1', cantidad: '10.0000' }] });
    expect(resultados.find).toHaveBeenCalledWith(expect.objectContaining({ where: { ordenId: '1' } }));
  });

  it('403: registrar no concede lectura', async () => {
    permisos = ['calidad.registrar_conformes'];
    expect((await request('/orden/1', 'GET')).status).toBe(403);
  });

  it('404 en consulta inexistente y 400 en id invalido', async () => {
    referencias.existsBy.mockResolvedValue(false);
    expect((await request('/orden/999', 'GET')).status).toBe(404);
    expect((await request('/orden/abc', 'GET')).status).toBe(400);
    expect((await request('/orden/0', 'GET')).status).toBe(400);
  });
});
