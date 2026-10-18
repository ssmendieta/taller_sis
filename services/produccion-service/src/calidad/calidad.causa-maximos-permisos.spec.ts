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

// Preparación: orden de prueba 1 con 100 producidas y 95 conformes (ABC-82),
// una cuenta con permiso de calidad y otra sin él. Cada caso declara su
// resultado esperado antes de ejecutarse.
const CUENTAS = {
  'con-permiso': { id: '42', rol: 'Encargado de Producción', permisos: ['calidad.registrar_conformes', 'ordenes.consultar'] },
  'sin-permiso': { id: '43', rol: 'Operario', permisos: ['ordenes.consultar', 'ordenes.registrar_avance', 'materiales.registrar_consumo'] },
};
type Cuenta = keyof typeof CUENTAS | 'token-rechazado' | null;
type Resultado = { id: string; ordenId: string; cantidad: string; tipo: string; causaDefecto: string | null; responsableUsuarioId: string; fechaHora: Date };

function sumar(resultados: Resultado[], tipo?: string): string {
  const diezmilesimas = resultados
    .filter((r) => !tipo || r.tipo === tipo)
    .reduce((suma, r) => suma + Math.round(Number(r.cantidad) * 10000), 0);
  return (diezmilesimas / 10000).toFixed(4);
}

describe('ABC-83: causa, máximos y permisos al registrar defectos', () => {
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
    resultados = [{
      id: '1', ordenId: '1', cantidad: '95.0000', tipo: 'CONFORME', causaDefecto: null,
      responsableUsuarioId: '42', fechaHora: new Date('2026-10-15T12:00:00Z'),
    }];
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
    // ABC-71: el registro solo lee la orden y sus avances y escribe resultados de calidad;
    // nunca toca consumos de materiales.
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

  async function consultar(cuenta: Cuenta, tipo: string) {
    const response = await httpFetch(`${base}/calidad/conformes/orden/1?tipo=${tipo}`, {
      headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    return { status: response.status, body: await response.json() };
  }

  const defecto = (cantidad: unknown, causaDefecto: unknown = 'Rotura') => ({ ordenId: 1, cantidad, tipo: 'DEFECTUOSO', causaDefecto });
  const resumen = () => ({ conformes: sumar(resultados, 'CONFORME'), defectuosas: sumar(resultados, 'DEFECTUOSO') });

  describe('caso válido y rechazado de la HU', () => {
    it('válido: 5 defectuosas por rotura → 201 y el resumen separa 95 conformes de 5 defectuosas', async () => {
      const respuesta = await registrar('con-permiso', defecto(5));
      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({ ordenId: '1', cantidad: '5.0000', tipo: 'DEFECTUOSO', causaDefecto: 'Rotura', responsableUsuarioId: '42' });
      expect(resumen()).toEqual({ conformes: '95.0000', defectuosas: '5.0000' });

      const defectos = await consultar('con-permiso', 'DEFECTUOSO');
      expect(defectos.status).toBe(200);
      expect(defectos.body).toEqual([expect.objectContaining({ cantidad: '5.0000', causaDefecto: 'Rotura', responsableUsuarioId: '42' })]);
    });

    it('rechazado: defecto sin motivo → 400 y el resumen se mantiene en 95 conformes y 0 defectuosas', async () => {
      const respuesta = await registrar('con-permiso', { ordenId: 1, cantidad: 5, tipo: 'DEFECTUOSO' });
      expect(respuesta.status).toBe(400);
      expect(transaction).not.toHaveBeenCalled();
      expect(resumen()).toEqual({ conformes: '95.0000', defectuosas: '0.0000' });
    });
  });

  describe('causa obligatoria', () => {
    it.each([
      ['causa vacía', 400, ''],
      ['causa con solo espacios', 400, '   '],
      ['causa que no es texto', 400, 123],
      ['causa de 501 caracteres', 400, 'x'.repeat(501)],
      ['causa de 500 caracteres', 201, 'x'.repeat(500)],
      ['causa con espacios en los extremos', 201, '  Rotura  '],
    ])('%s → %i', async (_caso, esperado, causaDefecto) => {
      const respuesta = await registrar('con-permiso', defecto(1, causaDefecto));
      expect(respuesta.status).toBe(esperado);
      if (esperado === 201) {
        expect(respuesta.body.causaDefecto).toBe(String(causaDefecto).trim());
        expect(resumen().defectuosas).toBe('1.0000');
      } else {
        expect(resumen()).toEqual({ conformes: '95.0000', defectuosas: '0.0000' });
      }
    });
  });

  describe('máximos con 100 producidas y 95 conformes', () => {
    it.each([
      ['5 defectuosas llenan lo producido', 201, 5],
      ['6 defectuosas superan lo producido', 409, 6],
      ['5.0001 defectuosas superan lo producido por una diezmilésima', 409, 5.0001],
      ['0.0001 es la cantidad mínima admitida', 201, 0.0001],
      ['0.00001 tiene más de cuatro decimales', 400, 0.00001],
      ['cero no es una cantidad positiva', 400, 0],
      ['una cantidad negativa', 400, -5],
      ['una cantidad enviada como texto', 400, '5'],
    ])('%s → %i', async (_caso, esperado, cantidad) => {
      const antes = resumen();
      const respuesta = await registrar('con-permiso', defecto(cantidad));
      expect(respuesta.status).toBe(esperado);
      if (esperado === 201) expect(resumen().defectuosas).toBe(Number(cantidad).toFixed(4));
      else expect(resumen()).toEqual(antes);
    });

    it('4.9999 + 0.0001 completan exactamente las 100 y una diezmilésima más → 409', async () => {
      expect((await registrar('con-permiso', defecto(4.9999))).status).toBe(201);
      expect((await registrar('con-permiso', defecto(0.0001, 'Sellado incompleto'))).status).toBe(201);
      expect(resumen()).toEqual({ conformes: '95.0000', defectuosas: '5.0000' });
      expect((await registrar('con-permiso', defecto(0.0001))).status).toBe(409);
      expect(resumen().defectuosas).toBe('5.0000');
    });

    it('acumula defectos previos: 3 + 2 caben y 1 más → 409', async () => {
      expect((await registrar('con-permiso', defecto(3))).status).toBe(201);
      expect((await registrar('con-permiso', defecto(2, 'Sellado incompleto'))).status).toBe(201);
      const rechazo = await registrar('con-permiso', defecto(1));
      expect(rechazo.status).toBe(409);
      expect(rechazo.body.message).toMatch(/no pueden superar las unidades producidas/);
      expect(resumen()).toEqual({ conformes: '95.0000', defectuosas: '5.0000' });
    });

    it('orden sin avances → 409 sin guardar', async () => {
      producido = '0.0000';
      resultados = [];
      expect((await registrar('con-permiso', defecto(1))).status).toBe(409);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('orden inexistente → 404 sin guardar', async () => {
      expect((await registrar('con-permiso', { ...defecto(1), ordenId: 999 })).status).toBe(404);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('permisos', () => {
    it('cuenta sin permiso de calidad (consulta, avances y consumos) → 403 sin abrir transacción', async () => {
      const respuesta = await registrar('sin-permiso', defecto(5));
      expect(respuesta.status).toBe(403);
      expect(transaction).not.toHaveBeenCalled();
      expect(resumen()).toEqual({ conformes: '95.0000', defectuosas: '0.0000' });
    });

    it('sin sesión → 401', async () => {
      expect((await registrar(null, defecto(5))).status).toBe(401);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('token rechazado por Auth → 401', async () => {
      expect((await registrar('token-rechazado', defecto(5))).status).toBe(401);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('Auth no disponible → 503 sin registrar', async () => {
      authDisponible = false;
      expect((await registrar('con-permiso', defecto(5))).status).toBe(503);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('la cuenta sin permiso de calidad puede consultar el historial de defectos → 200', async () => {
      await registrar('con-permiso', defecto(5));
      const respuesta = await consultar('sin-permiso', 'DEFECTUOSO');
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([expect.objectContaining({ cantidad: '5.0000', causaDefecto: 'Rotura', responsableUsuarioId: '42' })]);
    });
  });
});
