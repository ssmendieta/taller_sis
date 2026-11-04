import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { IntegracionesController } from './integraciones.controller';
import { IntegracionesService } from './integraciones.service';
import { PUBSUB_CONFIG } from './pubsub/pubsub.config';

describe('ABC-267: API administrativa', () => {
  let app: INestApplication;
  let base: string;
  const httpFetch = global.fetch;
  const repository = { findAndCount: jest.fn().mockResolvedValue([[], 0]) };
  const transaction = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [IntegracionesController],
      providers: [IntegracionesService, PermisoProduccionGuard,
        { provide: DataSource, useValue: { getRepository: () => repository, transaction } },
        { provide: PUBSUB_CONFIG, useValue: { enabled: false, projectId: 'prueba', topicId: 'eventos' } },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['?estado=ERROR'], ['?page=0'], ['?page=1.5'], ['?limit=101'],
    ['?limit=-1'], ['?page=1&page=2'],
  ])('rechaza parámetros inválidos: %s', async query => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', permisos: [{ codigo: 'integraciones.reintentar' }],
    })));
    const response = await httpFetch(`${base}/integraciones/eventos${query}`, {
      headers: { Authorization: 'Bearer prueba' },
    });
    expect(response.status).toBe(400);
    expect(repository.findAndCount).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1', '9223372036854775808'])('rechaza ID inválido: %s', async id => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', permisos: ['integraciones.reintentar'],
    })));
    const response = await httpFetch(`${base}/integraciones/eventos/${id}/reintentar`, {
      method: 'POST', headers: { Authorization: 'Bearer prueba' },
    });
    expect(response.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    [null, 404],
    [{ estado: 'PUBLICADO' }, 409],
    [{ estado: 'PROCESANDO', bloqueoHasta: new Date('2099-01-01') }, 409],
    [{ estado: 'PROCESANDO', bloqueoHasta: null }, 409],
  ])('rechaza evento ausente o no reintentable (%j)', async (evento, status) => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', permisos: ['integraciones.reintentar'],
    })));
    const save = jest.fn();
    transaction.mockImplementation(async callback => callback({ getRepository: () => ({
      findOne: async () => evento, save,
    }) }));
    const response = await httpFetch(`${base}/integraciones/eventos/1/reintentar`, {
      method: 'POST', headers: { Authorization: 'Bearer prueba' },
    });
    expect(response.status).toBe(status);
    expect(save).not.toHaveBeenCalled();
  });

  it('exige sesión también accediendo directamente al microservicio', async () => {
    for (const [path, method] of [['', 'GET'], ['/1/reintentar', 'POST']]) {
      const response = await httpFetch(`${base}/integraciones/eventos${path}`, { method });
      expect(response.status).toBe(401);
    }
    expect(transaction).not.toHaveBeenCalled();
    expect(repository.findAndCount).not.toHaveBeenCalled();
  });

  it('si Auth falla deniega ambas operaciones sin tocar la base', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Auth no disponible'));
    for (const [path, method] of [['', 'GET'], ['/1/reintentar', 'POST']]) {
      const response = await httpFetch(`${base}/integraciones/eventos${path}`, {
        method, headers: { Authorization: 'Bearer prueba' },
      });
      expect(response.status).toBe(503);
    }
    expect(transaction).not.toHaveBeenCalled();
    expect(repository.findAndCount).not.toHaveBeenCalled();
  });

  it('programa el mismo evento pendiente sin borrar el diagnóstico ni contar un intento', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', permisos: ['integraciones.reintentar'],
    })));
    const evento = { id: '1', eventId: 'original', correlationId: 'correlacion',
      estado: 'PENDIENTE', intentos: 3, ultimoError: 'No disponible',
      proximoIntentoEn: new Date(Date.now() + 60000) };
    transaction.mockImplementation(async callback => callback({ getRepository: () => ({
      findOne: async () => ({ ...evento }), save: async value => value,
    }) }));
    const result = await httpFetch(`${base}/integraciones/eventos/1/reintentar`, {
      method: 'POST', headers: { Authorization: 'Bearer prueba' },
    });
    expect(result.status).toBe(202);
    expect(await result.json()).toMatchObject({ mensaje: 'Reintento programado', evento: {
      id: '1', eventId: 'original', correlationId: 'correlacion', estado: 'PENDIENTE',
      intentos: 3, ultimoError: 'No disponible',
    } });
    transaction.mockClear();
  });

  it('consulta una página vacía con el permiso administrativo', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Administrador', permisos: ['integraciones.reintentar'],
    })));
    const result = await httpFetch(`${base}/integraciones/eventos`, {
      headers: { Authorization: 'Bearer prueba' },
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    repository.findAndCount.mockClear();
  });

  it('rechaza GET y POST sin permiso antes de acceder a los eventos', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: '42', rol: 'Administrador', permisos: [],
    })));
    for (const [path, method] of [['', 'GET'], ['/1/reintentar', 'POST']]) {
      const result = await httpFetch(`${base}/integraciones/eventos${path}`, {
        method, headers: { Authorization: 'Bearer prueba' },
      });
      expect(result.status).toBe(403);
    }
    expect(repository.findAndCount).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
