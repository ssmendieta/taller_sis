import 'reflect-metadata';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { ERP_RECURSOS_CONFIG } from './clientes/erp-recursos.config';
import { EJEMPLO_RESPUESTA_RECURSOS_V1 } from './dto/recursos-logisticos-v1';
import { RecursosExternosModule } from './recursos-externos.module';
import { CopiaRecursosLogisticos, RESPALDO_RECURSOS_LOGISTICOS } from './respaldo-recursos';

// PRUEBA SIMULADA: el ERP y Auth son servidores HTTP locales y la copia de
// respaldo (ABC-352) es un Map en memoria. El controlador, el pipe, el servicio,
// el guard y el cliente HTTP son los reales.
const FECHA = EJEMPLO_RESPUESTA_RECURSOS_V1.fecha;
const COPIA_ANTERIOR: CopiaRecursosLogisticos = {
  sincronizadoEn: '2026-11-09T18:30:00.000Z',
  respuesta: {
    ...EJEMPLO_RESPUESTA_RECURSOS_V1,
    generadoEn: '2026-11-09T18:00:00.000Z',
    vehiculos: [{ ...EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos[0], placa: '9999-OLD' }],
    choferes: [EJEMPLO_RESPUESTA_RECURSOS_V1.choferes[0]],
  },
};

type PasoErp = { status?: number; cuerpo?: unknown; demoraMs?: number };

describe('ABC-353 / ABC-354: GET /recursos-logisticos con ERP simulado, filtros, origen y vigencia', () => {
  const servidores: Server[] = [];
  const temporizadores = new Set<NodeJS.Timeout>();
  const authOriginal = process.env.AUTH_SERVICE_URL;
  let app: INestApplication;
  let base: string;
  let erp: PasoErp;
  let peticionesErp: { method: string; url: string }[];
  let permisos: string[];
  let copias: Map<string, CopiaRecursosLogisticos>;
  let falloRespaldo: 'obtener' | 'reemplazar' | null;

  async function escuchar(manejador: (req: IncomingMessage, res: ServerResponse) => void) {
    const servidor = createServer(manejador);
    servidores.push(servidor);
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  }

  beforeAll(async () => {
    const urlErp = await escuchar((req, res) => {
      peticionesErp.push({ method: req.method, url: req.url });
      const responder = () => {
        if (res.destroyed) return;
        res.writeHead(erp.status ?? 200, { 'Content-Type': 'application/json' });
        res.end(typeof erp.cuerpo === 'string' ? erp.cuerpo : JSON.stringify(erp.cuerpo ?? EJEMPLO_RESPUESTA_RECURSOS_V1));
      };
      if (!erp.demoraMs) return responder();
      const t = setTimeout(responder, erp.demoraMs);
      temporizadores.add(t);
    });
    process.env.AUTH_SERVICE_URL = await escuchar((req, res) => {
      const sesion = req.headers.authorization === 'Bearer sesion-de-prueba';
      res.writeHead(sesion ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sesion ? { id: '42', permisos: permisos.map((codigo) => ({ codigo })) } : { message: 'Sesión inválida' }));
    });

    const respaldo = {
      obtener: async (fecha: string) => {
        if (falloRespaldo === 'obtener') throw new Error('base de datos caída');
        return copias.get(fecha) ?? null;
      },
      reemplazar: async (copia: CopiaRecursosLogisticos) => {
        if (falloRespaldo === 'reemplazar') throw new Error('base de datos caída');
        copias.set(copia.respuesta.fecha, copia);
      },
    };
    const modulo = await Test.createTestingModule({ imports: [RecursosExternosModule] })
      .overrideProvider(ERP_RECURSOS_CONFIG)
      .useValue({ url: urlErp, token: 'token-de-prueba-no-real', timeoutMs: 150, reintentos: 1, esperaReintentoMs: 0 })
      .overrideProvider(RESPALDO_RECURSOS_LOGISTICOS)
      .useValue(respaldo)
      .compile();
    app = modulo.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    temporizadores.forEach(clearTimeout);
    for (const servidor of servidores) {
      servidor.closeAllConnections();
      await new Promise((resolver) => servidor.close(resolver));
    }
    if (authOriginal === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = authOriginal;
  });

  beforeEach(() => {
    erp = {};
    peticionesErp = [];
    permisos = ['logistica.boletas.consultar'];
    copias = new Map();
    falloRespaldo = null;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  async function consultar(parametros: string, sesion = true) {
    const respuesta = await fetch(`${base}/recursos-logisticos${parametros}`, {
      headers: sesion ? { Authorization: 'Bearer sesion-de-prueba' } : {},
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }

  const ids = (lista: { idExterno: string }[]) => lista.map((recurso) => recurso.idExterno);

  it('200 desde el ERP: todos los recursos, origen ERP, fechas de vigencia y copia reemplazada', async () => {
    const antes = Date.now();
    const { status, body } = await consultar(`?fecha=${FECHA}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      fecha: FECHA, origen: 'ERP', generadoEn: EJEMPLO_RESPUESTA_RECURSOS_V1.generadoEn, aviso: null,
      filtros: { disponible: null, capacidadMinima: null }, totales: { vehiculos: 2, choferes: 2 },
      vehiculos: EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos, choferes: EJEMPLO_RESPUESTA_RECURSOS_V1.choferes,
    });
    expect(Date.parse(body.sincronizadoEn)).toBeGreaterThanOrEqual(antes - 1000);
    expect(peticionesErp).toEqual([{ method: 'GET', url: `/v1/recursos-logisticos?fecha=${FECHA}` }]);
    expect(copias.get(FECHA)).toEqual({ respuesta: EJEMPLO_RESPUESTA_RECURSOS_V1, sincronizadoEn: body.sincronizadoEn });
  });

  it.each([
    ['disponible=true', ['VEH-01'], ['CHO-12']],
    ['disponible=false', ['VEH-02'], ['CHO-07']],
    ['capacidadMinima=1000&unidad=kg', ['VEH-01'], ['CHO-12', 'CHO-07']],
    ['capacidadMinima=800&unidad=kg', ['VEH-01', 'VEH-02'], ['CHO-12', 'CHO-07']],
    ['capacidadMinima=1500&unidad=kg', ['VEH-01'], ['CHO-12', 'CHO-07']],
    ['capacidadMinima=1500.0001&unidad=kg', [], ['CHO-12', 'CHO-07']],
    ['capacidadMinima=1&unidad=l', [], ['CHO-12', 'CHO-07']],
    ['disponible=false&capacidadMinima=1000&unidad=kg', [], ['CHO-07']],
  ])('filtro %s', async (filtro, vehiculos, choferes) => {
    const { status, body } = await consultar(`?fecha=${FECHA}&${filtro}`);
    expect(status).toBe(200);
    expect(ids(body.vehiculos)).toEqual(vehiculos);
    expect(ids(body.choferes)).toEqual(choferes);
    expect(body.totales).toEqual({ vehiculos: 2, choferes: 2 });
  });

  it('normaliza la capacidad mínima a 4 decimales en los filtros devueltos', async () => {
    const { body } = await consultar(`?fecha=${FECHA}&disponible=true&capacidadMinima=12.5&unidad=m3`);
    expect(body.filtros).toEqual({ disponible: true, capacidadMinima: { valor: '12.5000', unidad: 'm3' } });
  });

  it('timeout del ERP con copia: devuelve RESPALDO con aviso y fecha de la copia, sin modificarla', async () => {
    copias.set(FECHA, COPIA_ANTERIOR);
    erp = { demoraMs: 600 };
    const { status, body } = await consultar(`?fecha=${FECHA}&disponible=true`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      origen: 'RESPALDO', generadoEn: '2026-11-09T18:00:00.000Z', sincronizadoEn: COPIA_ANTERIOR.sincronizadoEn,
      aviso: { motivo: 'TIMEOUT', mensaje: expect.stringContaining('copia de respaldo') },
      totales: { vehiculos: 1, choferes: 1 },
    });
    expect(body.vehiculos[0].placa).toBe('9999-OLD');
    expect(peticionesErp).toHaveLength(2);
    expect(copias.get(FECHA)).toBe(COPIA_ANTERIOR);
  });

  it('respuesta inválida del ERP no reemplaza la copia: se muestra la anterior como respaldo', async () => {
    copias.set(FECHA, COPIA_ANTERIOR);
    erp = { cuerpo: { ...EJEMPLO_RESPUESTA_RECURSOS_V1, fecha: '2026-11-11' } };
    const { status, body } = await consultar(`?fecha=${FECHA}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ origen: 'RESPALDO', aviso: { motivo: 'RESPUESTA_INVALIDA' } });
    expect(copias.get(FECHA)).toBe(COPIA_ANTERIOR);
  });

  it('error del ERP conserva el respaldo y nunca lo presenta como una sincronización reciente', async () => {
    copias.set(FECHA, COPIA_ANTERIOR);
    erp = { status: 503 };
    const { status, body } = await consultar(`?fecha=${FECHA}&disponible=true`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      origen: 'RESPALDO',
      generadoEn: COPIA_ANTERIOR.respuesta.generadoEn,
      sincronizadoEn: COPIA_ANTERIOR.sincronizadoEn,
      aviso: { motivo: 'NO_DISPONIBLE', mensaje: expect.stringContaining('copia de respaldo') },
      vehiculos: [{ placa: '9999-OLD', disponible: true }],
      choferes: [{ idExterno: 'CHO-12', disponible: true }],
    });
    expect(body.sincronizadoEn).toBe(COPIA_ANTERIOR.sincronizadoEn);
    expect(copias.get(FECHA)).toBe(COPIA_ANTERIOR);
  });

  it('recurso duplicado del ERP se rechaza y no reemplaza el respaldo anterior', async () => {
    copias.set(FECHA, COPIA_ANTERIOR);
    erp = {
      cuerpo: {
        ...EJEMPLO_RESPUESTA_RECURSOS_V1,
        vehiculos: [
          EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos[0],
          EJEMPLO_RESPUESTA_RECURSOS_V1.vehiculos[0],
        ],
      },
    };
    const { status, body } = await consultar(`?fecha=${FECHA}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      origen: 'RESPALDO',
      sincronizadoEn: COPIA_ANTERIOR.sincronizadoEn,
      aviso: { motivo: 'RESPUESTA_INVALIDA' },
      vehiculos: [{ placa: '9999-OLD' }],
    });
    expect(body.vehiculos).toHaveLength(1);
    expect(copias.get(FECHA)).toBe(COPIA_ANTERIOR);
  });

  it.each([
    [{ demoraMs: 600 }, 'TIMEOUT'],
    [{ status: 503 }, 'NO_DISPONIBLE'],
    [{ status: 401 }, 'CREDENCIALES'],
    [{ cuerpo: '<html>' }, 'RESPUESTA_INVALIDA'],
  ])('ERP %j sin copia → 503 %s sin listas de recursos', async (paso, motivo) => {
    erp = paso;
    const { status, body } = await consultar(`?fecha=${FECHA}`);
    expect(status).toBe(503);
    expect(body).toEqual({
      statusCode: 503, error: 'Service Unavailable', codigo: 'RECURSOS_NO_DISPONIBLES', motivo,
      message: expect.stringContaining(`no hay copia de respaldo para ${FECHA}`),
    });
    expect(body).not.toHaveProperty('vehiculos');
    expect(copias.size).toBe(0);
  });

  it('si no se puede leer la copia, informa indisponibilidad (503) y no inventa datos', async () => {
    falloRespaldo = 'obtener';
    erp = { status: 500 };
    const { status, body } = await consultar(`?fecha=${FECHA}`);
    expect(status).toBe(503);
    expect(body.codigo).toBe('RECURSOS_NO_DISPONIBLES');
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('RESPALDO_RECURSOS_NO_LEIDO'));
  });

  it('si no se puede guardar la copia, igual devuelve los datos actuales del ERP', async () => {
    falloRespaldo = 'reemplazar';
    const { status, body } = await consultar(`?fecha=${FECHA}`);
    expect(status).toBe(200);
    expect(body.origen).toBe('ERP');
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('RESPALDO_RECURSOS_NO_GUARDADO'));
  });

  it('consultar no reserva: dos consultas siguen mostrando el recurso disponible y al ERP solo llegan GET', async () => {
    const primera = await consultar(`?fecha=${FECHA}&disponible=true`);
    const segunda = await consultar(`?fecha=${FECHA}&disponible=true`);
    expect(ids(primera.body.vehiculos)).toEqual(['VEH-01']);
    expect(segunda.body.vehiculos).toEqual(primera.body.vehiculos);
    expect(segunda.body.choferes).toEqual(primera.body.choferes);
    expect(peticionesErp.map((peticion) => peticion.method)).toEqual(['GET', 'GET']);
  });

  it.each([
    ['', 'fecha es obligatoria'],
    ['?fecha=2026-02-30', 'fecha es obligatoria'],
    ['?fecha=10/11/2026', 'fecha es obligatoria'],
    [`?fecha=${FECHA}&fecha=2026-11-11`, 'fecha debe enviarse una sola vez'],
    [`?fecha=${FECHA}&disponible=si`, 'disponible debe ser true o false'],
    [`?fecha=${FECHA}&capacidadMinima=100`, 'deben enviarse juntas'],
    [`?fecha=${FECHA}&unidad=kg`, 'deben enviarse juntas'],
    [`?fecha=${FECHA}&capacidadMinima=0&unidad=kg`, 'mayor que 0'],
    [`?fecha=${FECHA}&capacidadMinima=-5&unidad=kg`, 'mayor que 0'],
    [`?fecha=${FECHA}&capacidadMinima=1.12345&unidad=kg`, '4 decimales'],
    [`?fecha=${FECHA}&capacidadMinima=10&unidad=ton`, 'unidad debe ser una de: kg, l, m3, unidad, caja, paquete'],
    [`?fecha=${FECHA}&tipo=vehiculo`, 'Parámetro de consulta no permitido: tipo'],
  ])('400 %s sin llamar al ERP', async (parametros, mensaje) => {
    const { status, body } = await consultar(parametros);
    expect(status).toBe(400);
    expect(body.message).toContain(mensaje);
    expect(peticionesErp).toHaveLength(0);
  });

  it('401 sin sesión y 403 sin logistica.boletas.consultar, sin llamar al ERP', async () => {
    expect((await consultar(`?fecha=${FECHA}`, false)).status).toBe(401);
    permisos = ['logistica.solicitudes.consultar'];
    expect((await consultar(`?fecha=${FECHA}`)).status).toBe(403);
    expect(peticionesErp).toHaveLength(0);
  });

  it('la respuesta nunca incluye el token del ERP', async () => {
    erp = { status: 401 };
    copias.set(FECHA, COPIA_ANTERIOR);
    const conCopia = await consultar(`?fecha=${FECHA}`);
    copias.clear();
    const sinCopia = await consultar(`?fecha=${FECHA}`);
    expect(JSON.stringify([conCopia.body, sinCopia.body])).not.toContain('token-de-prueba-no-real');
  });
});

