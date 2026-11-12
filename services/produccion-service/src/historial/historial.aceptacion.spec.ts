import 'reflect-metadata';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';

// ABC-335 (verificación de ABC-108). PRUEBA SIMULADA: Auth es un servidor HTTP
// local y la base es un doble que registra las consultas del servicio.
// El guard, el pipe de filtros, el controlador y HistorialService son los reales.

describe('ABC-335: criterios de aceptación del historial de producción', () => {
  describe('API: filtros, intervalo inválido, vacío y permisos', () => {
    const authOriginal = process.env.AUTH_SERVICE_URL;
    let auth: Server;
    let app: INestApplication;
    let url: string;
    let permisos: string[];
    const servicio = {
      listarOrdenes: jest.fn(async (query: any) => ({ items: [], total: 0, page: query.page, limit: query.limit, totalPages: 0 })),
      detalleOrden: jest.fn(async (id: number) => ({ orden: { id }, eventos: [] })),
    };

    beforeAll(async () => {
      auth = createServer((req, res) => {
        const ok = req.headers.authorization === 'Bearer sesion';
        res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(ok ? { id: '7', permisos: permisos.map((codigo) => ({ codigo })) } : {}));
      });
      await new Promise<void>((r) => auth.listen(0, '127.0.0.1', r));
      process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(auth.address() as AddressInfo).port}`;
      const modulo = await Test.createTestingModule({
        controllers: [HistorialController],
        providers: [{ provide: HistorialService, useValue: servicio }],
      }).compile();
      app = modulo.createNestApplication({ logger: false });
      await app.listen(0, '127.0.0.1');
      url = await app.getUrl();
    });

    afterAll(async () => {
      await app?.close();
      auth.closeAllConnections();
      await new Promise((r) => auth.close(r));
      if (authOriginal === undefined) delete process.env.AUTH_SERVICE_URL; else process.env.AUTH_SERVICE_URL = authOriginal;
    });

    beforeEach(() => { permisos = ['ordenes.consultar']; jest.clearAllMocks(); });

    const pedir = (ruta: string, metodo = 'GET', sesion = true) =>
      fetch(`${url}${ruta}`, { method: metodo, headers: sesion ? { Authorization: 'Bearer sesion' } : {} });

    it('CA-01: combina fecha, estado y producto y conserva los filtros al pasar de página', async () => {
      const filtros = 'fechaDesde=2026-11-01&fechaHasta=2026-11-30&estado=FINALIZADA&producto=Galleta&limit=5';
      expect((await pedir(`/historial/ordenes?${filtros}&page=1`)).status).toBe(200);
      expect((await pedir(`/historial/ordenes?${filtros}&page=2`)).status).toBe(200);
      const esperado = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estado: 'FINALIZADA', producto: 'Galleta', limit: 5 };
      expect(servicio.listarOrdenes.mock.calls.map(([q]) => q)).toEqual([{ ...esperado, page: 1 }, { ...esperado, page: 2 }]);
    });

    it('CA-04: un período sin órdenes devuelve la lista vacía', async () => {
      const respuesta = await pedir('/historial/ordenes?fechaDesde=2030-01-01&fechaHasta=2030-01-31');
      expect(await respuesta.json()).toEqual({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    });

    it.each([
      ['fechaDesde=2026-11-30&fechaHasta=2026-11-01', 'fechaDesde no puede ser posterior a fechaHasta'],
      ['fechaDesde=2026-02-30', 'fechaDesde debe ser una fecha real YYYY-MM-DD'],
      ['estado=PERDIDA', 'estado debe ser uno de'],
      ['page=0', 'page debe ser entero'],
      ['limit=101', 'limit debe ser entero entre 1 y 100'],
      ['cliente=X', 'Parametro invalido: cliente'],
    ])('CA-04: rechaza %s con 400', async (filtro, mensaje) => {
      const respuesta = await pedir(`/historial/ordenes?${filtro}`);
      expect(respuesta.status).toBe(400);
      expect((await respuesta.json()).message).toContain(mensaje);
      expect(servicio.listarOrdenes).not.toHaveBeenCalled();
    });

    it('CA-05: sin sesión 401 y sin ordenes.consultar 403, sin consultar datos', async () => {
      expect((await pedir('/historial/ordenes', 'GET', false)).status).toBe(401);
      permisos = ['materiales.solicitar'];
      expect((await pedir('/historial/ordenes')).status).toBe(403);
      expect((await pedir('/historial/ordenes/1/eventos')).status).toBe(403);
      expect(servicio.listarOrdenes).not.toHaveBeenCalled();
      expect(servicio.detalleOrden).not.toHaveBeenCalled();
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('CA-05: solo lectura, %s no existe (404)', async (metodo) => {
      expect((await pedir('/historial/ordenes', metodo)).status).toBe(404);
      expect((await pedir('/historial/ordenes/1/eventos', metodo)).status).toBe(404);
    });

    it('CA-02: el detalle se pide por id de orden; un id inválido es 400', async () => {
      expect((await pedir('/historial/ordenes/12/eventos')).status).toBe(200);
      expect(servicio.detalleOrden).toHaveBeenCalledWith(12);
      expect((await pedir('/historial/ordenes/abc/eventos')).status).toBe(400);
    });
  });

  describe('Servicio: consultas reales con una base simulada', () => {
    function constructorConsulta(total: number, filas: unknown[] = [], fila?: unknown) {
      const llamadas: Array<[string, ...unknown[]]> = [];
      const qb: any = new Proxy({}, {
        get: (_t, metodo: string) => {
          if (metodo === 'getCount') return async () => total;
          if (metodo === 'getRawMany') return async () => filas;
          if (metodo === 'getRawOne') return async () => fila;
          if (metodo === 'clone') return () => qb;
          return (...args: unknown[]) => { llamadas.push([metodo, ...args]); return qb; };
        },
      });
      return { qb, llamadas };
    }

    it('CA-01 y CA-03: filtros combinados, orden por fecha y desempate por id, página y total', async () => {
      const { qb, llamadas } = constructorConsulta(12, [{ id: 9 }]);
      const servicio = new HistorialService({ createQueryBuilder: () => qb } as any);
      const r = await servicio.listarOrdenes({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-30', estado: 'FINALIZADA' as any, producto: '50%_x', page: 2, limit: 5 });
      expect(llamadas.filter(([m]) => m === 'andWhere').map(([, , p]) => p)).toEqual([
        { desde: '2026-11-01' }, { hasta: '2026-11-30' }, { estado: 'FINALIZADA' }, { producto: '%50\\%\\_x%' },
      ]);
      expect(llamadas.filter(([m]) => m === 'orderBy' || m === 'addOrderBy').map(([, c, d]) => `${c} ${d}`)).toEqual([
        'orden.fecha_programada DESC', 'orden.id DESC',
      ]);
      expect(llamadas.find(([m]) => m === 'limit')![1]).toBe(5);
      expect(llamadas.find(([m]) => m === 'offset')![1]).toBe(5);
      expect(r).toEqual({ items: [{ id: 9 }], total: 12, page: 2, limit: 5, totalPages: 3 });
    });

    it('CA-04: sin resultados devuelve items vacíos y 0 páginas', async () => {
      const { qb } = constructorConsulta(0);
      const r = await new HistorialService({ createQueryBuilder: () => qb } as any).listarOrdenes({ page: 1, limit: 10 });
      expect(r).toEqual({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    });

    function detalle(orden: unknown) {
      const consultas: Array<{ sql: string; params: unknown[] }> = [];
      const { qb } = constructorConsulta(0, [], orden);
      const manager = {
        getRepository: () => ({ createQueryBuilder: () => qb }),
        query: async (sql: string, params: unknown[]) => { consultas.push({ sql, params }); return [{ tipo: 'ESTADO' }]; },
      };
      const transaction = jest.fn(async (_nivel: string, trabajo: (m: unknown) => unknown) => trabajo(manager));
      const servicio = new HistorialService({ manager: { transaction } } as any);
      return { servicio, consultas, transaction };
    }

    it('CA-02: eventos solo de la orden pedida, de todas las fuentes y en orden cronológico', async () => {
      const { servicio, consultas, transaction } = detalle({ id: '12', codigo: 'ORD-12', estado: 'FINALIZADA', unidadProducto: 'kg' });
      const r = await servicio.detalleOrden(12);
      expect(transaction).toHaveBeenCalledWith('REPEATABLE READ', expect.any(Function));
      expect(consultas).toHaveLength(1);
      const { sql, params } = consultas[0];
      expect(params).toEqual([12, 'kg']);
      for (const tabla of ['historial_estado_orden', 'avances_produccion', 'resultados_conformes', 'perdidas_materia_prima', 'observaciones_orden', 'lotes', 'reprocesos']) {
        expect(sql).toMatch(new RegExp(`FROM ${tabla}[^U]*WHERE (\\w+\\.)?orden_id = \\$1`));
      }
      expect(sql).toContain('ORDER BY fecha_hora ASC, prioridad ASC, id ASC');
      expect(r.orden.id).toBe(12);
    });

    it('CA-05: el detalle es solo lectura (sin INSERT, UPDATE ni DELETE)', async () => {
      const { servicio, consultas } = detalle({ id: '12', unidadProducto: 'kg' });
      await servicio.detalleOrden(12);
      expect(consultas[0].sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    });

    it('CA-02: orden inexistente es 404 y un id no válido es 400', async () => {
      await expect(detalle(undefined).servicio.detalleOrden(999)).rejects.toBeInstanceOf(NotFoundException);
      await expect(detalle(undefined).servicio.detalleOrden(0)).rejects.toThrow('entero positivo');
    });
  });
});
