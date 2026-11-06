import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { PerdidaMateriaPrima } from './entities/perdida-materia-prima.entity';
import { PerdidasMateriaPrimaController } from './perdidas-materia-prima.controller';
import { PerdidasMateriaPrimaService } from './perdidas-materia-prima.service';

// Datos de prueba: ORD-0001 y ORD-0002 usan la receta 10 (harina en kg y leche en l);
// la sal existe pero no está en la receta. La base se simula en memoria.
const ORDENES = [{ id: 1, codigo: 'ORD-0001', producto_id: 10 }, { id: 2, codigo: 'ORD-0002', producto_id: 10 }];
const MATERIALES = [
  { id: 1, codigo: 'HAR-001', nombre: 'Harina', unidadMedida: 'kg' },
  { id: 2, codigo: 'LEC-001', nombre: 'Leche', unidadMedida: 'l' },
  { id: 3, codigo: 'SAL-001', nombre: 'Sal', unidadMedida: 'kg' },
];
const RECETA = [{ recetaId: 10, materialId: 1 }, { recetaId: 10, materialId: 2 }];
const CUENTAS = {
  produccion: { id: '42', rol: 'Encargado de Producción', permisos: ['materiales.registrar_consumo', 'ordenes.consultar'] },
  consulta: { id: '43', rol: 'Supervisor', permisos: ['ordenes.consultar'] },
  logistica: { id: '51', rol: 'Encargado de Logística', permisos: ['logistica.boletas.consultar'] },
};
type Cuenta = keyof typeof CUENTAS | null;
type Perdida = { id: string; ordenId: string; materialId: string; cantidad: string; unidad: string; motivo: string; autorUsuarioId: string; fechaHora: Date };

describe('ABC-74: API para registrar y listar pérdidas de materia prima', () => {
  let app: INestApplication;
  let base: string;
  let perdidas: Perdida[];
  let reloj: Date;
  const httpFetch = global.fetch;
  const manager = { findOne: jest.fn(), save: jest.fn() };
  const transaction = jest.fn(async (callback: (m: typeof manager) => unknown) => callback(manager));
  const existsBy = jest.fn();
  const repositorio = { find: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PerdidasMateriaPrimaController],
      providers: [PerdidasMateriaPrimaService, PermisoProduccionGuard,
        { provide: getRepositoryToken(PerdidaMateriaPrima), useValue: repositorio },
        { provide: DataSource, useValue: { transaction, getRepository: () => ({ existsBy }) } }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    reloj = new Date('2026-11-05T14:00:00.000Z');
    perdidas = [
      { id: '1', ordenId: '2', materialId: '1', cantidad: '9.0000', unidad: 'kg', motivo: 'Otra orden', autorUsuarioId: '42', fechaHora: new Date('2026-11-05T09:00:00.000Z') },
    ];
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const token = (new Headers(init?.headers).get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const cuenta = CUENTAS[token as keyof typeof CUENTAS];
      return cuenta
        ? new Response(JSON.stringify(cuenta), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ message: 'Sesión inválida' }), { status: 401 });
    });
    manager.findOne.mockImplementation(async (entidad, { where }) => {
      if (entidad === OrdenProduccion) return ORDENES.find((o) => o.id === where.id) ?? null;
      if (entidad === Material) return MATERIALES.find((m) => m.id === where.id) ?? null;
      if (entidad === RecetaMaterial) return RECETA.find((r) => r.recetaId === where.recetaId && r.materialId === where.materialId) ?? null;
      return null;
    });
    // La BD asigna id y fecha; el reloj controlado permite fechas iguales.
    manager.save.mockImplementation(async (_entidad, datos) => {
      const guardada = { id: String(perdidas.length + 1), ...datos, fechaHora: new Date(reloj) };
      perdidas.push(guardada);
      return guardada;
    });
    existsBy.mockImplementation(async ({ id }) => ORDENES.some((o) => o.id === id));
    repositorio.find.mockImplementation(async ({ where, order }) => perdidas
      .filter((p) => p.ordenId === where.ordenId)
      .sort((a, b) => (order.fechaHora === 'ASC' ? a.fechaHora.getTime() - b.fechaHora.getTime() : 0) || Number(a.id) - Number(b.id))
      .map((p) => ({ ...p, material: MATERIALES.find((m) => String(m.id) === p.materialId) })));
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await app.close(); });

  async function registrar(datos: unknown, cuenta: Cuenta = 'produccion') {
    const response = await httpFetch(`${base}/perdidas-materia-prima`, {
      method: 'POST',
      headers: { ...(cuenta ? { Authorization: `Bearer ${cuenta}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    return { status: response.status, body: await response.json() };
  }

  async function listar(ordenId: string | number, cuenta: Cuenta = 'consulta') {
    const response = await httpFetch(`${base}/perdidas-materia-prima/orden/${ordenId}`, {
      headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    return { status: response.status, body: await response.json() };
  }

  const valida = { ordenId: 1, materialId: 1, cantidad: 2.125, unidad: 'kg', motivo: 'Derrame en mezcladora' };

  describe('POST /perdidas-materia-prima', () => {
    it('201: registra la pérdida con autor de la sesión y fecha del servidor', async () => {
      const respuesta = await registrar({ ...valida, motivo: '  Derrame en mezcladora  ' });
      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({
        ordenId: '1', materialId: '1', cantidad: '2.1250', unidad: 'kg', motivo: 'Derrame en mezcladora', autorUsuarioId: '42',
      });
      expect(respuesta.body.fechaHora).toBe('2026-11-05T14:00:00.000Z');
    });

    it.each([
      ['cantidad cero', { ...valida, cantidad: 0 }],
      ['cantidad negativa', { ...valida, cantidad: -1 }],
      ['cantidad con cinco decimales', { ...valida, cantidad: 1.00001 }],
      ['cantidad como texto', { ...valida, cantidad: '2' }],
      ['sin cantidad', { ...valida, cantidad: undefined }],
      ['motivo vacío', { ...valida, motivo: '' }],
      ['motivo con solo espacios', { ...valida, motivo: '   ' }],
      ['sin motivo', { ...valida, motivo: undefined }],
      ['motivo que no es texto', { ...valida, motivo: 123 }],
      ['motivo de 501 caracteres', { ...valida, motivo: 'x'.repeat(501) }],
      ['unidad fuera del catálogo', { ...valida, unidad: 'kilo' }],
      ['orden no positiva', { ...valida, ordenId: 0 }],
      ['material no numérico', { ...valida, materialId: 'x' }],
      ['autor enviado por el cliente', { ...valida, autorUsuarioId: 99 }],
      ['fecha enviada por el cliente', { ...valida, fechaHora: '2020-01-01T00:00:00Z' }],
    ])('400: %s', async (_caso, datos) => {
      expect((await registrar(datos)).status).toBe(400);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('400: unidad incompatible con el material (harina en g) sin guardar', async () => {
      const respuesta = await registrar({ ...valida, unidad: 'g' });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.message).toBe('La unidad del material debe ser kg');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('400: material que no pertenece a la receta de la orden sin guardar', async () => {
      const respuesta = await registrar({ ...valida, materialId: 3 });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.message).toBe('El material no corresponde a la receta de la orden');
      expect(manager.save).not.toHaveBeenCalled();
    });

    it.each([
      ['orden inexistente', { ...valida, ordenId: 999 }, 'Orden con id 999 no encontrada'],
      ['material inexistente', { ...valida, materialId: 999 }, 'Material con id 999 no encontrado'],
    ])('404: %s sin guardar', async (_caso, datos, mensaje) => {
      const respuesta = await registrar(datos);
      expect(respuesta.status).toBe(404);
      expect(respuesta.body.message).toBe(mensaje);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('403: una cuenta sin materiales.registrar_consumo no registra pérdidas', async () => {
      expect((await registrar(valida, 'consulta')).status).toBe(403);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('401: sin sesión no registra', async () => {
      expect((await registrar(valida, null)).status).toBe(401);
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('GET /perdidas-materia-prima/orden/:ordenId', () => {
    it('200: lista solo las pérdidas de la orden pedida, con su material', async () => {
      await registrar(valida);
      await registrar({ ...valida, materialId: 2, cantidad: 0.5, unidad: 'l', motivo: 'Vencida' });
      const respuesta = await listar(1);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.map((p: Perdida) => p.ordenId)).toEqual(['1', '1']);
      expect(respuesta.body.map((p: Perdida & { material: { codigo: string } }) => `${p.material.codigo} ${p.cantidad} ${p.unidad} ${p.motivo}`))
        .toEqual(['HAR-001 2.1250 kg Derrame en mezcladora', 'LEC-001 0.5000 l Vencida']);
      expect(respuesta.body.some((p: Perdida) => p.motivo === 'Otra orden')).toBe(false);
      expect(repositorio.find).toHaveBeenCalledWith({
        where: { ordenId: '1' }, relations: { material: true }, order: { fechaHora: 'ASC', id: 'ASC' },
      });
    });

    it('200: orden temporal estable, por fecha y luego por id cuando la fecha coincide', async () => {
      reloj = new Date('2026-11-05T16:00:00.000Z');
      await registrar({ ...valida, motivo: 'Tercera por hora' });
      reloj = new Date('2026-11-05T15:00:00.000Z');
      await registrar({ ...valida, motivo: 'Primera' });
      await registrar({ ...valida, motivo: 'Segunda, misma hora' });
      expect((await listar(1)).body.map((p: Perdida) => p.motivo)).toEqual(['Primera', 'Segunda, misma hora', 'Tercera por hora']);
    });

    it('200: una orden sin pérdidas devuelve una lista vacía', async () => {
      expect(await listar(1)).toEqual({ status: 200, body: [] });
    });

    it('404: orden inexistente', async () => {
      expect((await listar(999)).status).toBe(404);
      expect(repositorio.find).not.toHaveBeenCalled();
    });

    it.each(['abc', '0', '-1', '1.5'])('400: identificador de orden inválido %s', async (id) => {
      expect((await listar(id)).status).toBe(400);
      expect(repositorio.find).not.toHaveBeenCalled();
    });

    it('403: sin ordenes.consultar no lista; 401 sin sesión', async () => {
      expect((await listar(1, 'logistica')).status).toBe(403);
      expect((await listar(1, null)).status).toBe(401);
      expect(repositorio.find).not.toHaveBeenCalled();
    });
  });
});
