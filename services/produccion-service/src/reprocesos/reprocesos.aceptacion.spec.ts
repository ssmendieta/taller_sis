import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { DataSource } from 'typeorm';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Reproceso } from './entities/reproceso.entity';
import { ReprocesosController } from './reprocesos.controller';
import { ReprocesosService } from './reprocesos.service';

// ABC-398 (verificación de ABC-394). PRUEBA SIMULADA: Auth es un servidor HTTP
// local y PostgreSQL una base en memoria que imita lo que exigen los criterios:
// bloqueo pessimistic_write de orden y resultado hasta el fin de la transacción,
// lectura READ COMMITTED (cada transacción ve lo confirmado más su borrador),
// rollback si la transacción falla y los CHECK de la migración de reprocesos.
// El guard, el ValidationPipe, el controlador y ReprocesosService son los reales.
// Las consultas de saldo y totales se resuelven con la misma fórmula del SQL del
// servicio; esa SQL se prueba contra PostgreSQL en reproceso.persistencia.spec.ts.

type Fila = Record<string, any>;
const d = (valor: string | number) => BigInt(Number(valor).toFixed(4).replace('.', ''));
const texto = (diez: bigint) => {
  const signo = diez < BigInt(0) ? '-' : '';
  const abs = (diez < BigInt(0) ? -diez : diez).toString().padStart(5, '0');
  return `${signo}${abs.slice(0, -4)}.${abs.slice(-4)}`;
};

class BaseSimulada {
  ordenes = [{ id: 1 }, { id: 2 }];
  resultados: Fila[] = [
    { id: '1', ordenId: '1', tipo: 'DEFECTUOSO', cantidad: '5.0000', causaDefecto: 'Sellado incompleto' },
    { id: '2', ordenId: '1', tipo: 'CONFORME', cantidad: '90.0000', causaDefecto: null },
    { id: '3', ordenId: '2', tipo: 'DEFECTUOSO', cantidad: '4.0000', causaDefecto: 'Empaque dañado' },
  ];
  avances: Fila[] = [{ ordenId: '1', cantidadProducida: '100.0000' }];
  reprocesos: Fila[] = [];
  fallarInsercionUnaVez = false;
  sinBloqueos = false;
  private bloqueos = new Map<string, Promise<void>>();

  private manager(borrador: Fila[], tenidos: Set<string>, soltar: Array<() => void>) {
    const pausa = () => new Promise((resolver) => setImmediate(resolver));
    // La consulta de saldo tarda: sin bloqueos, dos transacciones leerían el mismo saldo.
    const espera = () => new Promise((resolver) => setTimeout(resolver, 15));
    const visibles = () => [...this.reprocesos, ...borrador];
    const bloquear = async (clave: string) => {
      if (this.sinBloqueos || tenidos.has(clave)) return;
      while (this.bloqueos.has(clave)) await this.bloqueos.get(clave);
      tenidos.add(clave);
      let liberar!: () => void;
      this.bloqueos.set(clave, new Promise<void>((resolver) => { liberar = resolver; }));
      soltar.push(() => { this.bloqueos.delete(clave); liberar(); });
    };
    // Interpreta las expresiones que arma ReprocesosService: SUM(alias.campo) con
    // filtro por tipo, resta del saldo y la combinación final de las CTE. Así una
    // fórmula cambiada en el servicio cambia también el resultado de la prueba.
    const filasDe = (entidad: unknown) => (entidad === Reproceso ? visibles() : this.resultados);
    const sumar = (filas: Fila[], campo: string) => filas.reduce((total, fila) => total + d(fila[campo]), BigInt(0));
    const filtrar = (entidad: unknown, condicion: string, params: Fila) => {
      const [, campo, parametro] = /\w+\.(\w+) = :(\w+)/.exec(condicion)!;
      return filasDe(entidad).filter((fila) => String(fila[campo]) === String(params[parametro]));
    };
    const agregado = (filas: Fila[], expr: string) => {
      const [, campo] = /SUM\(\w+\.(\w+)\)/.exec(expr)!;
      const tipo = /tipo = '(\w+)'/.exec(expr)?.[1];
      return sumar(tipo ? filas.filter((fila) => fila.tipo === tipo) : filas, campo);
    };
    const qb = (entidad?: unknown) => {
      const estado = { entidad, selects: [] as Array<{ expr: string; alias: string }>, condicion: '', params: {} as Fila, ctes: [] as Array<{ sub: any; nombre: string }> };
      const api: any = {
        select: (expr: string, alias: string) => { estado.selects.push({ expr, alias }); return api; },
        addSelect: (expr: string, alias: string) => { estado.selects.push({ expr, alias }); return api; },
        where: (condicion: string, params: Fila = {}) => { estado.condicion = condicion; Object.assign(estado.params, params); return api; },
        setParameter: (clave: string, valor: unknown) => { estado.params[clave] = valor; return api; },
        addCommonTableExpression: (sub: any, nombre: string) => { estado.ctes.push({ sub, nombre }); return api; },
        from: () => api, addFrom: () => api,
        estado,
        // Fila agregada de esta consulta, en diezmilésimas.
        fila: () => {
          const filas = filtrar(estado.entidad, estado.condicion, estado.params);
          return Object.fromEntries(estado.selects.map(({ expr, alias }) => {
            const resta = /:(\w+)::numeric\(14,4\) - COALESCE\(SUM/.exec(expr);
            return [alias, resta ? d(estado.params[resta[1]]) - agregado(filas, expr) : agregado(filas, expr)];
          }));
        },
        getRawOne: async () => {
          await espera();
          if (!estado.ctes.length) {
            return Object.fromEntries(Object.entries(api.fila()).map(([alias, valor]) => [alias, texto(valor as bigint)]));
          }
          const tablas = Object.fromEntries(estado.ctes.map(({ sub, nombre }) => [nombre, sub.fila()]));
          const valor = (termino: string) => { const [tabla, columna] = termino.split('.'); return tablas[tabla][columna] as bigint; };
          return Object.fromEntries(estado.selects.map(({ expr, alias }) => {
            const [a, operador, b] = expr.replace(/::text/g, '').replace(/[()]/g, '').trim().split(/\s+/);
            const total = operador === '+' ? valor(a) + valor(b) : operador === '-' ? valor(a) - valor(b) : valor(a);
            return [alias, texto(total)];
          }));
        },
      };
      return api;
    };

    return {
      findOne: async (entidad: unknown, opciones: any) => {
        await pausa();
        const where = opciones.where;
        if (entidad === OrdenProduccion) {
          const orden = this.ordenes.find((o) => o.id === Number(where.id));
          if (orden && opciones.lock) await bloquear(`orden:${orden.id}`);
          return orden ? { ...orden } : null;
        }
        if (entidad === ResultadoConforme) {
          const resultado = this.resultados.find((r) => r.id === String(where.id) && r.ordenId === String(where.ordenId));
          if (resultado && opciones.lock) await bloquear(`resultado:${resultado.id}`);
          return resultado ? { ...resultado } : null;
        }
        return null;
      },
      existsBy: async (_entidad: unknown, where: any) => this.ordenes.some((o) => o.id === Number(where.id)),
      find: async (_entidad: unknown, opciones: any) => visibles()
        .filter((r) => r.ordenId === String(opciones.where.ordenId))
        .sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime() || Number(a.id) - Number(b.id))
        .map((r) => ({ ...r })),
      getRepository: (entidad: unknown) => ({ createQueryBuilder: () => qb(entidad) }),
      createQueryBuilder: (entidad?: unknown) => qb(entidad),
      save: async (_entidad: unknown, valor: Fila) => {
        await pausa();
        if (this.fallarInsercionUnaVez) {
          this.fallarInsercionUnaVez = false;
          throw Object.assign(new Error('conexión con la base perdida'), { driverError: { code: '57P01' } });
        }
        // CHECK ck_reproceso_cantidades_no_negativas y ck_reproceso_balance_cantidades
        const [p, r, s] = [d(valor.cantidadProcesada), d(valor.cantidadRecuperada), d(valor.cantidadDescartada)];
        if (p < BigInt(0) || r < BigInt(0) || s < BigInt(0) || r + s !== p) {
          throw Object.assign(new Error('violates check constraint'), { driverError: { code: '23514' } });
        }
        const fila = { ...valor, id: String(this.reprocesos.length + borrador.length + 1), fechaHora: new Date() };
        borrador.push(fila);
        return { ...fila };
      },
    };
  }

  readonly dataSource = {
    transaction: async (_nivel: string, trabajo: (manager: unknown) => Promise<unknown>) => {
      const borrador: Fila[] = [];
      const tenidos = new Set<string>();
      const soltar: Array<() => void> = [];
      try {
        const resultado = await trabajo(this.manager(borrador, tenidos, soltar));
        this.reprocesos.push(...borrador);
        return resultado;
      } finally {
        soltar.forEach((liberar) => liberar());
      }
    },
  };
}

const ENCARGADO = ['ordenes.consultar', 'calidad.registrar_conformes'];
const SUPERVISOR = ['ordenes.consultar'];

describe('ABC-398: criterios de aceptación de ABC-394 por HTTP (prueba simulada)', () => {
  const authOriginal = process.env.AUTH_SERVICE_URL;
  let auth: Server;
  let app: INestApplication;
  let url: string;
  let base: BaseSimulada;
  let sesion: { id: string; permisos: string[] } | null;

  beforeAll(async () => {
    auth = createServer((req, res) => {
      const valida = sesion && req.headers.authorization === 'Bearer sesion-prueba';
      res.writeHead(valida ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(valida ? { id: sesion!.id, nombre: 'Prueba', permisos: sesion!.permisos.map((codigo) => ({ codigo })) } : {}));
    });
    await new Promise<void>((resolver) => auth.listen(0, '127.0.0.1', resolver));
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(auth.address() as AddressInfo).port}`;
    const modulo = await Test.createTestingModule({
      controllers: [ReprocesosController],
      // La base se asigna en beforeEach: cada prueba empieza con datos nuevos.
      providers: [{ provide: ReprocesosService, useFactory: () => new ReprocesosService(null as unknown as DataSource) }],
    }).compile();
    app = modulo.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  beforeEach(() => {
    base = new BaseSimulada();
    (app.get(ReprocesosService) as any).dataSource = base.dataSource;
    sesion = { id: '42', permisos: ENCARGADO };
  });

  afterAll(async () => {
    await app?.close();
    auth.closeAllConnections();
    await new Promise((resolver) => auth.close(resolver));
    if (authOriginal === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = authOriginal;
  });

  async function post(ordenId: number | string, cuerpo: Record<string, unknown>, conSesion = true) {
    const respuesta = await fetch(`${url}/ordenes/${ordenId}/reprocesos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(conSesion ? { Authorization: 'Bearer sesion-prueba' } : {}) },
      body: JSON.stringify(cuerpo),
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }

  async function get(ordenId: number | string) {
    const respuesta = await fetch(`${url}/ordenes/${ordenId}/reprocesos`, { headers: { Authorization: 'Bearer sesion-prueba' } });
    return { status: respuesta.status, body: await respuesta.json() };
  }

  const reproceso = (procesada: number, recuperada: number, descartada: number, resultadoCalidadId = '1') =>
    ({ resultadoCalidadId, cantidadProcesada: procesada, cantidadRecuperada: recuperada, cantidadDescartada: descartada });

  describe('CA-03: cinco defectuosas, reprocesar tres con dos recuperadas', () => {
    it('deja 2 defectuosas, suma 2 conformes y registra 1 descarte con autor de la sesión', async () => {
      const ejemplo = await post(1, reproceso(3, 2, 1));
      expect(ejemplo.status).toBe(201);
      expect(ejemplo.body.reproceso).toMatchObject({
        ordenId: '1', resultadoCalidadId: '1', cantidadProcesada: '3.0000', cantidadRecuperada: '2.0000',
        cantidadDescartada: '1.0000', autorUsuarioId: '42',
      });
      // 90 conformes previas + 2 recuperadas; 5 - 3 defectuosas.
      expect(ejemplo.body.totales).toEqual({ conformes: '92.0000', defectuosas: '2.0000', procesadas: '3.0000', recuperadas: '2.0000', descartadas: '1.0000' });
    });

    it('el historial se consulta desde la orden con los mismos totales', async () => {
      await post(1, reproceso(3, 2, 1));
      await post(1, reproceso(1.5, 0, 1.5));
      const { status, body } = await get(1);
      expect(status).toBe(200);
      expect(body.items.map((i: Fila) => [i.cantidadProcesada, i.cantidadRecuperada, i.cantidadDescartada])).toEqual([
        ['3.0000', '2.0000', '1.0000'], ['1.5000', '0.0000', '1.5000'],
      ]);
      expect(body.totales).toEqual({ conformes: '92.0000', defectuosas: '0.5000', procesadas: '4.5000', recuperadas: '2.0000', descartadas: '2.5000' });
    });

    it('sin reprocesos el historial está vacío y los totales son los de calidad', async () => {
      const { body } = await get(1);
      expect(body).toEqual({ items: [], totales: { conformes: '90.0000', defectuosas: '5.0000', procesadas: '0.0000', recuperadas: '0.0000', descartadas: '0.0000' } });
    });
  });

  describe('CA-01: cantidad positiva que no supera el saldo defectuoso', () => {
    it.each([
      ['cero', reproceso(0, 0, 0), 400],
      ['negativa', reproceso(-1, 0, -1), 400],
      ['mayor que el saldo (6 de 5)', reproceso(6, 6, 0), 409],
    ])('rechaza cantidad %s sin registrar nada', async (_caso, cuerpo, esperado) => {
      const { status } = await post(1, cuerpo);
      expect(status).toBe(esperado);
      expect(base.reprocesos).toEqual([]);
    });

    it('el saldo se descuenta: 3 de 5 y luego 3 más se rechaza; 2 más se acepta y agota el saldo', async () => {
      expect((await post(1, reproceso(3, 3, 0))).status).toBe(201);
      const exceso = await post(1, reproceso(3, 3, 0));
      expect(exceso).toMatchObject({ status: 409, body: { message: 'La cantidad procesada supera el saldo defectuoso disponible' } });
      expect((await post(1, reproceso(2, 1, 1))).status).toBe(201);
      expect((await post(1, reproceso(0.0001, 0.0001, 0))).status).toBe(409);
      expect((await get(1)).body.totales.defectuosas).toBe('0.0000');
    });
  });

  describe('CA-02: recuperadas + descartadas = procesadas, sin negativas', () => {
    it.each([
      ['suma menor', reproceso(3, 1, 1), 'deben sumar la procesada'],
      ['suma mayor', reproceso(3, 2, 2), 'deben sumar la procesada'],
      ['recuperada negativa', reproceso(3, -1, 4), 'cantidadRecuperada'],
      ['descartada negativa', reproceso(3, 4, -1), 'cantidadDescartada'],
      ['más de 4 decimales', reproceso(1.00001, 1.00001, 0), 'cuatro decimales'],
      ['cantidad como texto', { ...reproceso(3, 2, 1), cantidadProcesada: '3' }, 'cantidadProcesada'],
    ])('400 con %s', async (_caso, cuerpo, mensaje) => {
      const { status, body } = await post(1, cuerpo);
      expect(status).toBe(400);
      expect(JSON.stringify(body.message)).toContain(mensaje);
      expect(base.reprocesos).toEqual([]);
    });

    it('acepta decimales que balancean exactamente (2.125 = 1.0625 + 1.0625)', async () => {
      expect((await post(1, reproceso(2.125, 1.0625, 1.0625))).status).toBe(201);
    });
  });

  describe('CA-04: transacción que impide el sobreconsumo concurrente', () => {
    it('dos solicitudes simultáneas de 3 sobre un saldo de 5: una 201 y otra 409', async () => {
      const respuestas = await Promise.all([post(1, reproceso(3, 2, 1)), post(1, reproceso(3, 2, 1))]);
      expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(base.reprocesos).toHaveLength(1);
      expect((await get(1)).body.totales).toMatchObject({ defectuosas: '2.0000', procesadas: '3.0000' });
    });

    it('cinco solicitudes simultáneas de 2 sobre un saldo de 5: solo dos se registran', async () => {
      const respuestas = await Promise.all(Array.from({ length: 5 }, () => post(1, reproceso(2, 2, 0))));
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(2);
      expect(respuestas.filter((r) => r.status === 409)).toHaveLength(3);
      expect((await get(1)).body.totales).toMatchObject({ defectuosas: '1.0000', procesadas: '4.0000' });
    });

    it('directo sobre el servicio: dos registros simultáneos de 3 sobre 5 dejan uno solo', async () => {
      const servicio = app.get(ReprocesosService);
      const resultados = await Promise.allSettled([
        servicio.registrar(1, reproceso(3, 2, 1) as any, 42),
        servicio.registrar(1, reproceso(3, 3, 0) as any, 43),
      ]);
      expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect((resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.status).toBe(409);
      expect(base.reprocesos).toHaveLength(1);
    });

    it('un fallo al guardar hace rollback: no queda registro y el saldo sigue completo', async () => {
      base.fallarInsercionUnaVez = true;
      expect((await post(1, reproceso(3, 2, 1))).status).toBe(500);
      expect(base.reprocesos).toEqual([]);
      expect((await post(1, reproceso(5, 5, 0))).status).toBe(201);
    });
  });

  describe('Sin doble conteo de unidades', () => {
    it('no modifica resultados de calidad ni avances: solo agrega movimientos de reproceso', async () => {
      const resultados = JSON.stringify(base.resultados);
      const avances = JSON.stringify(base.avances);
      await post(1, reproceso(3, 2, 1));
      await post(1, reproceso(2, 2, 0));
      expect(JSON.stringify(base.resultados)).toBe(resultados);
      expect(JSON.stringify(base.avances)).toBe(avances);
      // Clasificadas antes: 95 (90 + 5). Después: 94 conformes + 0 defectuosas + 1 descartada = 95.
      const { totales } = (await get(1)).body;
      expect(d(totales.conformes) + d(totales.defectuosas) + d(totales.descartadas)).toBe(d(95));
    });

    it('los saldos de un resultado no se mezclan con los de otra orden', async () => {
      await post(1, reproceso(5, 5, 0));
      expect((await post(2, reproceso(4, 4, 0, '3'))).status).toBe(201);
    });
  });

  describe('CA-05: permisos y errores de la orden', () => {
    it('401 sin sesión; el Supervisor consulta pero no registra (403)', async () => {
      expect((await post(1, reproceso(3, 2, 1), false)).status).toBe(401);
      sesion = { id: '7', permisos: SUPERVISOR };
      expect((await post(1, reproceso(3, 2, 1))).status).toBe(403);
      expect((await get(1)).status).toBe(200);
      sesion = { id: '8', permisos: [] };
      expect((await get(1)).status).toBe(403);
      expect(base.reprocesos).toEqual([]);
    });

    it.each([
      ['orden inexistente', 99, reproceso(1, 1, 0), 404],
      ['resultado de otra orden', 1, reproceso(1, 1, 0, '3'), 404],
      ['resultado CONFORME', 1, reproceso(1, 1, 0, '2'), 409],
      ['id de orden inválido', 'abc', reproceso(1, 1, 0), 400],
    ])('%s → %i', async (_caso, ordenId, cuerpo, esperado) => {
      expect((await post(ordenId as number, cuerpo)).status).toBe(esperado);
      expect(base.reprocesos).toEqual([]);
    });

    it('el autor y la fecha no se aceptan del cliente', async () => {
      const { status } = await post(1, { ...reproceso(1, 1, 0), autorUsuarioId: '99', fechaHora: '2026-01-01' });
      expect(status).toBe(400);
    });

    it('GET de una orden inexistente responde 404', async () => {
      expect((await get(99)).status).toBe(404);
    });
  });
});
