import { BadRequestException, Logger } from '@nestjs/common';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { ErpRecursosClient } from './clientes/erp-recursos.client';
import { ErpRecursosConfig } from './clientes/erp-recursos.config';
import { EJEMPLO_RESPUESTA_RECURSOS_V1, ErpRecursosNoDisponibleError } from './dto/recursos-logisticos-v1';

// PRUEBA SIMULADA: el ERP es un servidor HTTP local que responde según el
// contrato recursos-logisticos v1. No se usa un ERP real ni sus credenciales.
const TOKEN = 'token-de-prueba-no-real';
const FECHA = EJEMPLO_RESPUESTA_RECURSOS_V1.fecha;

type Comportamiento = { status?: number; cuerpo?: unknown; demoraEncabezadosMs?: number; demoraCuerpoMs?: number };

describe('ABC-351: cliente del ERP de recursos con timeout, reintentos y validación', () => {
  let servidor: Server;
  let base: string;
  let guion: Comportamiento[];
  let peticiones: { url: string; authorization?: string; accept?: string }[];
  let esperas: number[];
  let registros: string[];
  const temporizadores = new Set<NodeJS.Timeout>();

  beforeAll(async () => {
    servidor = createServer((req: IncomingMessage, res: ServerResponse) => {
      peticiones.push({ url: req.url, authorization: req.headers.authorization, accept: req.headers.accept });
      const paso = guion.length > 1 ? guion.shift() : guion[0];
      const cuerpo = typeof paso.cuerpo === 'string' ? paso.cuerpo : JSON.stringify(paso.cuerpo ?? EJEMPLO_RESPUESTA_RECURSOS_V1);
      const responder = () => {
        if (res.destroyed) return;
        res.writeHead(paso.status ?? 200, { 'Content-Type': 'application/json' });
        if (!paso.demoraCuerpoMs) return res.end(cuerpo);
        res.write(cuerpo.slice(0, 10));
        const t = setTimeout(() => !res.destroyed && res.end(cuerpo.slice(10)), paso.demoraCuerpoMs);
        temporizadores.add(t);
      };
      if (!paso.demoraEncabezadosMs) return responder();
      const t = setTimeout(responder, paso.demoraEncabezadosMs);
      temporizadores.add(t);
    });
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    temporizadores.forEach(clearTimeout);
    servidor.closeAllConnections();
    await new Promise((resolver) => servidor.close(resolver));
  });

  beforeEach(() => {
    guion = [{ status: 200 }];
    peticiones = [];
    esperas = [];
    registros = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((mensaje: unknown) => { registros.push(String(mensaje)); });
  });

  afterEach(() => jest.restoreAllMocks());

  function cliente(config: Partial<ErpRecursosConfig> = {}) {
    return new ErpRecursosClient(
      { url: `${base}/`, token: TOKEN, timeoutMs: 150, reintentos: 2, esperaReintentoMs: 200, ...config },
      async (ms) => { esperas.push(ms); },
    );
  }

  async function fallo(promesa: Promise<unknown>): Promise<ErpRecursosNoDisponibleError> {
    try {
      await promesa;
    } catch (error) {
      expect(error).toBeInstanceOf(ErpRecursosNoDisponibleError);
      return error as ErpRecursosNoDisponibleError;
    }
    throw new Error('Debía fallar y no presentar disponibilidad');
  }

  it('obtiene recursos válidos con el contrato v1: ruta, fecha, Bearer y Accept', async () => {
    const respuesta = await cliente().consultarRecursos(FECHA);
    expect(respuesta).toEqual(EJEMPLO_RESPUESTA_RECURSOS_V1);
    expect(peticiones).toEqual([{ url: `/v1/recursos-logisticos?fecha=${FECHA}`, authorization: `Bearer ${TOKEN}`, accept: 'application/json' }]);
  });

  it('respeta una URL base con prefijo', async () => {
    await cliente({ url: `${base}/erp/api` }).consultarRecursos(FECHA);
    expect(peticiones[0].url).toBe(`/erp/api/v1/recursos-logisticos?fecha=${FECHA}`);
  });

  it('timeout: reintenta lo configurado y falla con TIMEOUT sin devolver recursos', async () => {
    guion = [{ demoraEncabezadosMs: 600 }];
    const error = await fallo(cliente().consultarRecursos(FECHA));
    expect(error.motivo).toBe('TIMEOUT');
    expect(peticiones).toHaveLength(3);
    expect(esperas).toEqual([200, 400]);
  });

  it('timeout también si el cuerpo llega incompleto a tiempo', async () => {
    guion = [{ demoraCuerpoMs: 600 }];
    const error = await fallo(cliente({ reintentos: 0 }).consultarRecursos(FECHA));
    expect(error.motivo).toBe('TIMEOUT');
    expect(error.detalle).toBe('respuesta incompleta en 150 ms');
  });

  it('un fallo transitorio seguido de éxito devuelve los recursos', async () => {
    guion = [{ status: 503 }, { status: 200 }];
    expect(await cliente().consultarRecursos(FECHA)).toEqual(EJEMPLO_RESPUESTA_RECURSOS_V1);
    expect(peticiones).toHaveLength(2);
    expect(esperas).toEqual([200]);
  });

  it('5xx persistente: NO_DISPONIBLE tras 1 intento + 2 reintentos', async () => {
    guion = [{ status: 500 }];
    const error = await fallo(cliente().consultarRecursos(FECHA));
    expect(error.motivo).toBe('NO_DISPONIBLE');
    expect(peticiones).toHaveLength(3);
  });

  it('ERP apagado (sin conexión): NO_DISPONIBLE', async () => {
    const error = await fallo(cliente({ url: 'http://127.0.0.1:1', reintentos: 1 }).consultarRecursos(FECHA));
    expect(error.motivo).toBe('NO_DISPONIBLE');
    expect(esperas).toEqual([200]);
  });

  it.each([
    [401, 'CREDENCIALES'],
    [403, 'CREDENCIALES'],
    [400, 'SOLICITUD_RECHAZADA'],
    [404, 'SOLICITUD_RECHAZADA'],
    [429, 'SOLICITUD_RECHAZADA'],
  ])('HTTP %i → %s sin reintentar', async (status, motivo) => {
    guion = [{ status }];
    expect((await fallo(cliente().consultarRecursos(FECHA))).motivo).toBe(motivo);
    expect(peticiones).toHaveLength(1);
    expect(esperas).toEqual([]);
  });

  it.each([
    ['cuerpo que no es JSON', '<html>error</html>', 'el cuerpo no es JSON'],
    ['vehículo duplicado', { ...EJEMPLO_RESPUESTA_RECURSOS_V1, vehiculos: [EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos[0], EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos[0]] }, 'vehiculos[1].idExterno: duplicado: VEH-01'],
    ['fecha de otro día', { ...EJEMPLO_RESPUESTA_RECURSOS_V1, fecha: '2026-11-11' }, 'fecha: no corresponde a la fecha consultada 2026-11-10'],
    ['capacidad cero', { ...EJEMPLO_RESPUESTA_RECURSOS_V1, vehiculos: [{ ...EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos[0], capacidad: { valor: '0', unidad: 'kg' } }] }, 'vehiculos[0].capacidad.valor: debe ser mayor que cero'],
  ])('200 con %s → RESPUESTA_INVALIDA sin reintentar ni devolver datos', async (_caso, cuerpo, detalle) => {
    guion = [{ status: 200, cuerpo }];
    const error = await fallo(cliente().consultarRecursos(FECHA));
    expect(error.motivo).toBe('RESPUESTA_INVALIDA');
    expect(error.detalle).toBe(detalle);
    expect(peticiones).toHaveLength(1);
  });

  it('sin URL o sin token no llama al ERP', async () => {
    expect((await fallo(cliente({ url: null }).consultarRecursos(FECHA))).motivo).toBe('NO_DISPONIBLE');
    expect((await fallo(cliente({ token: null }).consultarRecursos(FECHA))).motivo).toBe('CREDENCIALES');
    expect(peticiones).toHaveLength(0);
  });

  it.each(['10/11/2026', '2026-02-30', ''])('rechaza la fecha %s antes de llamar al ERP', async (fecha) => {
    await expect(cliente().consultarRecursos(fecha)).rejects.toBeInstanceOf(BadRequestException);
    expect(peticiones).toHaveLength(0);
  });

  it('registra cada intento fallido sin exponer el token', async () => {
    guion = [{ status: 401 }];
    const error = await fallo(cliente().consultarRecursos(FECHA));
    expect(registros).toHaveLength(1);
    expect(JSON.parse(registros[0])).toMatchObject({ codigo: 'CONSULTA_ERP_RECURSOS_FALLIDA', fecha: FECHA, intento: 1, motivo: 'CREDENCIALES' });
    expect([...registros, error.message, error.detalle].join(' ')).not.toContain(TOKEN);
  });
});
