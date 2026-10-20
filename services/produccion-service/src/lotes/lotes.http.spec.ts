import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Lote } from './entities/lote.entity';
import { LotesController } from './lotes.controller';
import { LotesService } from './lotes.service';

// ORD-0001 tiene 20 conformes (ABC-82). La cuenta de Producción registra calidad;
// la de consulta solo puede ver la orden.
const CUENTAS = {
  produccion: { id: '42', rol: 'Encargado de Producción', permisos: ['calidad.registrar_conformes', 'ordenes.consultar'] },
  consulta: { id: '43', rol: 'Supervisor', permisos: ['ordenes.consultar', 'ordenes.registrar_avance'] },
};
type Cuenta = keyof typeof CUENTAS | null;
const ORDEN = { id: 1, codigo: 'ORD-0001', producto_id: 10 };

describe('ABC-294: API para crear y consultar lotes', () => {
  let app: INestApplication;
  let base: string;
  let conformes: string;
  let lotes: Array<{ id: string; codigo: string; ordenId: string; cantidad: string; responsableUsuarioId: string; fechaHora: Date }>;
  const httpFetch = global.fetch;

  const suma = (valores: string[]) => (valores.reduce((t, v) => t + Math.round(Number(v) * 10000), 0) / 10000).toFixed(4);
  const total = (valor: () => string) => {
    const query = { select: () => query, where: () => query, andWhere: () => query, getRawOne: async () => ({ total: valor() }) };
    return query;
  };
  const repositorioLotes = {
    existsBy: jest.fn(async ({ codigo }: { codigo: string }) => lotes.some((l) => l.codigo === codigo)),
    count: jest.fn(async () => lotes.length),
    createQueryBuilder: () => total(() => suma(lotes.map((l) => l.cantidad))),
  };
  const manager = {
    findOne: jest.fn(async (_entidad: unknown, { where }: { where: { id: number } }) => (where.id === ORDEN.id ? ORDEN : null)),
    getRepository: (entidad: unknown) => (entidad === Lote ? repositorioLotes : { createQueryBuilder: () => total(() => conformes) }),
    save: jest.fn(async (_entidad: unknown, datos: Omit<(typeof lotes)[number], 'id' | 'fechaHora'>) => {
      const lote = { id: String(lotes.length + 1), ...datos, fechaHora: new Date() };
      lotes.push(lote);
      return lote;
    }),
  };
  const transaction = jest.fn(async (callback: (m: typeof manager) => unknown) => callback(manager));
  const consultaPorOrden = (codigo: string) => {
    const query = {
      innerJoinAndSelect: () => query, orderBy: () => query,
      where: (_sql: string, params: { codigo: string }) => { codigo = params.codigo; return query; },
      getMany: async () => (codigo === ORDEN.codigo ? lotes.map((l) => ({ ...l, orden: ORDEN })) : []),
    };
    return query;
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LotesController],
      providers: [LotesService, PermisoProduccionGuard,
        { provide: DataSource, useValue: { transaction, getRepository: (entidad: unknown) => (entidad === Lote ? { createQueryBuilder: () => consultaPorOrden('') } : undefined) } }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    conformes = '20.0000';
    lotes = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const token = (new Headers(init?.headers).get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const cuenta = CUENTAS[token as keyof typeof CUENTAS];
      return cuenta
        ? new Response(JSON.stringify(cuenta), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ message: 'Sesión inválida' }), { status: 401 });
    });
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { await app.close(); });

  async function crear(datos: unknown, cuenta: Cuenta = 'produccion') {
    const response = await httpFetch(`${base}/lotes`, {
      method: 'POST',
      headers: { ...(cuenta ? { Authorization: `Bearer ${cuenta}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    return { status: response.status, body: await response.json() };
  }

  async function consultar(ordenCodigo = ORDEN.codigo, cuenta: Cuenta = 'consulta') {
    const response = await httpFetch(`${base}/lotes/orden/${ordenCodigo}`, {
      headers: cuenta ? { Authorization: `Bearer ${cuenta}` } : {},
    });
    return { status: response.status, body: await response.json() };
  }

  it('201: crea el lote con codigo generado, vinculado a la orden, con responsable de la sesion', async () => {
    const respuesta = await crear({ ordenId: 1, cantidad: 20 });
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ codigo: 'LOT-ORD-0001-001', ordenId: '1', cantidad: '20.0000', responsableUsuarioId: '42' });
    expect(Number.isNaN(Date.parse(respuesta.body.fechaHora))).toBe(false);

    const consulta = await consultar();
    expect(consulta.status).toBe(200);
    expect(consulta.body).toEqual([expect.objectContaining({
      codigo: 'LOT-ORD-0001-001', ordenCodigo: 'ORD-0001', cantidad: '20.0000', responsableUsuarioId: '42',
    })]);
  });

  it('el codigo lo genera el servidor: el que envia el cliente se ignora', async () => {
    const respuesta = await crear({ ordenId: 1, codigo: 'L-7', cantidad: 20 });
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.codigo).toBe('LOT-ORD-0001-001');
  });

  it('409: con los 20 conformes ya asignados, otro lote por 20 se rechaza sin guardarse', async () => {
    await crear({ ordenId: 1, cantidad: 20 });
    const respuesta = await crear({ ordenId: 1, cantidad: 20 });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.message).toBe('La cantidad supera los conformes disponibles sin asignar de la orden');
    expect(lotes.map((l) => l.codigo)).toEqual(['LOT-ORD-0001-001']);
  });

  it('asigna en partes hasta el total: 12 + 8 caben y 0.0001 mas se rechaza', async () => {
    expect((await crear({ ordenId: 1, cantidad: 12 })).status).toBe(201);
    expect((await crear({ ordenId: 1, cantidad: 8 })).status).toBe(201);
    expect((await crear({ ordenId: 1, cantidad: 0.0001 })).status).toBe(409);
    expect(lotes).toHaveLength(2);
  });

  it('cada lote de la orden recibe el siguiente codigo generado', async () => {
    await crear({ ordenId: 1, cantidad: 5 });
    await crear({ ordenId: 1, cantidad: 5 });
    expect(lotes.map((l) => l.codigo)).toEqual(['LOT-ORD-0001-001', 'LOT-ORD-0001-002']);
  });

  it.each([
    ['cantidad cero', { ordenId: 1, cantidad: 0 }],
    ['cantidad con cinco decimales', { ordenId: 1, cantidad: 1.00001 }],
    ['cantidad como texto', { ordenId: 1, cantidad: '20' }],
    ['responsable enviado por el cliente', { ordenId: 1, cantidad: 1, responsableUsuarioId: '99' }],
    ['fecha enviada por el cliente', { ordenId: 1, cantidad: 1, fechaHora: '2020-01-01' }],
  ])('400: %s', async (_caso, datos) => {
    expect((await crear(datos)).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('404: orden inexistente', async () => {
    expect((await crear({ ordenId: 999, cantidad: 1 })).status).toBe(404);
    expect(lotes).toHaveLength(0);
  });

  it('403: sin calidad.registrar_conformes no se crea el lote, pero si se puede consultar', async () => {
    expect((await crear({ ordenId: 1, cantidad: 20 }, 'consulta')).status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
    expect(await consultar()).toEqual({ status: 200, body: [] });
  });

  it('401: sin sesion no se crea ni se consulta', async () => {
    expect((await crear({ ordenId: 1, cantidad: 20 }, null)).status).toBe(401);
    expect((await consultar(ORDEN.codigo, null)).status).toBe(401);
  });
});
