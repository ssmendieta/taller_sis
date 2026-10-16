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

// Preparación: orden de prueba 1 con 100 unidades producidas según sus avances y
// sin resultados de calidad, una cuenta con permiso de calidad y otra sin él.
// Cada caso declara su resultado esperado antes de ejecutarse.
const CUENTAS = {
  'con-permiso': { id: '42', rol: 'Encargado de Producción', permisos: ['calidad.registrar_conformes', 'ordenes.consultar'] },
  'sin-permiso': { id: '43', rol: 'Operario', permisos: ['ordenes.consultar', 'ordenes.registrar_avance', 'materiales.registrar_consumo'] },
  'solo-registro': { id: '44', rol: 'Calidad', permisos: ['calidad.registrar_conformes'] },
};
type Cuenta = keyof typeof CUENTAS | 'token-rechazado' | null;
type Resultado = { id: string; ordenId: string; cantidad: string; tipo: string; causaDefecto: string | null; responsableUsuarioId: string; fechaHora: Date };

function sumar(resultados: Resultado[], tipo?: string): string {
  const diezmilesimas = resultados
    .filter((r) => !tipo || r.tipo === tipo)
    .reduce((suma, r) => suma + Math.round(Number(r.cantidad) * 10000), 0);
  return (diezmilesimas / 10000).toFixed(4);
}

describe('ABC-82: límites y autorización al registrar conformes', () => {
  let app: INestApplication;
  let base: string;
  let producido: string;
  let resultados: Resultado[];
  let authDisponible: boolean;
  const httpFetch = global.fetch;
  const resultadosRepository = { find: jest.fn() };
  const manager = { findOne: jest.fn(), getRepository: jest.fn(), save: jest.fn() };
  const transaction = jest.fn(async (callback) => callback(manager));
  const existsBy = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CalidadController],
      providers: [CalidadService, PermisoProduccionGuard,
        { provide: getRepositoryToken(ResultadoConforme), useValue: resultadosRepository },
        { provide: DataSource, useValue: { transaction, getRepository: () => ({ existsBy }) } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    producido = '100.0000';
    resultados = [];
    authDisponible = true;

    // Auth responde /me según el token: cada token representa una cuenta de prueba.
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      if (!authDisponible) throw new TypeError('fetch failed');
      const token = (new Headers(init?.headers).get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const cuenta = CUENTAS[token as keyof typeof CUENTAS];
      return cuenta
        ? new Response(JSON.stringify(cuenta), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ message: 'Sesión inválida' }), { status: 401 });
    });
    manager.findOne.mockImplementation(async (_entidad, { where }) => (where.id === 1 ? { id: 1 } : null));
    manager.getRepository.mockImplementation((entidad) => ({
      createQueryBuilder: () => {
        const query = {
          select: () => query, where: () => query,
          getRawOne: async () => ({ total: entidad === AvancesProduccion ? producido : sumar(resultados) }),
        };
        return query;
      },
    }));
    manager.save.mockImplementation(async (_entidad, datos) => {
      const guardado = { id: String(resultados.length + 1), ...datos, fechaHora: new Date() };
      resultados.push(guardado);
      return guardado;
    });
    existsBy.mockImplementation(async ({ id }) => id === 1);
    resultadosRepository.find.mockImplementation(async ({ where }) =>
      resultados.filter((r) => r.ordenId === where.ordenId && r.tipo === where.tipo));
  });

  afterEach(() => {
    // El registro solo lee la orden y sus avances y escribe resultados de calidad.
    for (const [entidad] of manager.getRepository.mock.calls) expect([AvancesProduccion, ResultadoConforme]).toContain(entidad);
    for (const [entidad] of manager.findOne.mock.calls) expect(entidad).toBe(OrdenProduccion);
    for (const [entidad] of manager.save.mock.calls) expect(entidad).toBe(ResultadoConforme);
    jest.restoreAllMocks();
  });

  afterAll(async () => { await app.close(); });

  async function registrar(cuenta: Cuenta, datos: unknown) {
    const response = await httpFetch(`${base}/calidad/conformes`, {
      method: 'POST',
      headers: { ...(cuenta ? { Authorization: `Bearer ${cuenta}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    return { status: response.status, body: await response.json() };
  }

  async function consultar(cuenta: Cuenta) {
    const response = await httpFetch(`${base}/calidad/conformes/orden/1`, {
      headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    return { status: response.status, body: await response.json() };
  }

  const conforme = (cantidad: unknown) => ({ ordenId: 1, cantidad });
  const acumulado = () => sumar(resultados, 'CONFORME');

  describe('caso válido y rechazado de la HU', () => {
    it('válido: 95 conformes con 100 producidas → 201 y el acumulado muestra 95', async () => {
      const respuesta = await registrar('con-permiso', conforme(95));
      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({ ordenId: '1', cantidad: '95.0000', tipo: 'CONFORME', causaDefecto: null, responsableUsuarioId: '42' });
      expect(Number.isNaN(Date.parse(respuesta.body.fechaHora))).toBe(false);

      const consulta = await consultar('con-permiso');
      expect(consulta.status).toBe(200);
      expect(consulta.body).toEqual([expect.objectContaining({ cantidad: '95.0000', responsableUsuarioId: '42' })]);
      expect(acumulado()).toBe('95.0000');
    });

    it('rechazado: con 95 conformes, otras 10 → 409, explica el límite y el acumulado sigue en 95', async () => {
      await registrar('con-permiso', conforme(95));
      const respuesta = await registrar('con-permiso', conforme(10));
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.message).toBe('Conformes y defectuosos acumulados no pueden superar las unidades producidas según los avances');
      expect(acumulado()).toBe('95.0000');
      expect((await consultar('con-permiso')).body).toHaveLength(1);
    });
  });

  describe('exceso sobre 100 producidas', () => {
    it.each([
      ['105 conformes de una vez', 409, 105],
      ['100.0001 conformes, una diezmilésima de más', 409, 100.0001],
      ['100 conformes completan exactamente lo producido', 201, 100],
    ])('%s → %i', async (_caso, esperado, cantidad) => {
      const respuesta = await registrar('con-permiso', conforme(cantidad));
      expect(respuesta.status).toBe(esperado);
      expect(acumulado()).toBe(esperado === 201 ? Number(cantidad).toFixed(4) : '0.0000');
    });

    it('95 + 5 completan las 100 y una diezmilésima más → 409', async () => {
      expect((await registrar('con-permiso', conforme(95))).status).toBe(201);
      expect((await registrar('con-permiso', conforme(5))).status).toBe(201);
      expect((await registrar('con-permiso', conforme(0.0001))).status).toBe(409);
      expect(acumulado()).toBe('100.0000');
    });

    it('el límite también descuenta defectuosas registradas: 95 conformes + 5 defectuosas y 1 conforme más → 409', async () => {
      await registrar('con-permiso', conforme(95));
      await registrar('con-permiso', { ordenId: 1, cantidad: 5, tipo: 'DEFECTUOSO', causaDefecto: 'Rotura' });
      expect((await registrar('con-permiso', conforme(1))).status).toBe(409);
      expect(acumulado()).toBe('95.0000');
    });

    it('orden sin avances → 409 sin guardar', async () => {
      producido = '0.0000';
      expect((await registrar('con-permiso', conforme(1))).status).toBe(409);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('orden inexistente → 404 sin guardar', async () => {
      expect((await registrar('con-permiso', { ordenId: 999, cantidad: 1 })).status).toBe(404);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('cantidad positiva', () => {
    it.each([
      ['cero', 400, 0],
      ['una cantidad negativa', 400, -10],
      ['más de cuatro decimales', 400, 1.00001],
      ['una cantidad enviada como texto', 400, '95'],
      ['sin cantidad', 400, undefined],
      ['0.0001, la cantidad mínima admitida', 201, 0.0001],
    ])('%s → %i', async (_caso, esperado, cantidad) => {
      const respuesta = await registrar('con-permiso', conforme(cantidad));
      expect(respuesta.status).toBe(esperado);
      if (esperado === 400) expect(transaction).not.toHaveBeenCalled();
      expect(acumulado()).toBe(esperado === 201 ? '0.0001' : '0.0000');
    });
  });

  describe('fecha y responsable los pone el servidor', () => {
    it.each([
      ['responsableUsuarioId', 400, '99'],
      ['fechaHora', 400, '2020-01-01T00:00:00Z'],
      ['causaDefecto', 400, 'No corresponde a un conforme'],
    ])('enviar %s → %i', async (campo, esperado, valor) => {
      const respuesta = await registrar('con-permiso', { ...conforme(10), [campo]: valor });
      expect(respuesta.status).toBe(esperado);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('autorización', () => {
    it('cuenta sin permiso de calidad (consulta, avances y consumos) → 403 sin abrir transacción', async () => {
      const respuesta = await registrar('sin-permiso', conforme(95));
      expect(respuesta.status).toBe(403);
      expect(transaction).not.toHaveBeenCalled();
      expect(acumulado()).toBe('0.0000');
    });

    it('sin sesión → 401', async () => {
      expect((await registrar(null, conforme(95))).status).toBe(401);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('token rechazado por Auth → 401', async () => {
      expect((await registrar('token-rechazado', conforme(95))).status).toBe(401);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('Auth no disponible → 503 sin registrar', async () => {
      authDisponible = false;
      expect((await registrar('con-permiso', conforme(95))).status).toBe(503);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('la cuenta sin permiso de calidad puede consultar el acumulado → 200', async () => {
      await registrar('con-permiso', conforme(95));
      const respuesta = await consultar('sin-permiso');
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([expect.objectContaining({ cantidad: '95.0000' })]);
    });

    it('el permiso de registrar no concede la consulta → 403', async () => {
      expect((await consultar('solo-registro')).status).toBe(403);
    });

    it('consultar sin sesión → 401', async () => {
      expect((await consultar(null)).status).toBe(401);
    });
  });
});
