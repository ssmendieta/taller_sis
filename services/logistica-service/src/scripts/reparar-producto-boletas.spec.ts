import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { repararProductoHistorico } from '../boletas/reparar-producto-historico';
import { ejecutarReparacion } from './reparar-producto-boletas';

jest.mock('../boletas/reparar-producto-historico', () => ({ repararProductoHistorico: jest.fn() }));

describe('CLI de reparación local: autorización y alcance', () => {
  const reparar = repararProductoHistorico as jest.Mock;
  const nombres = ['AUTH_SERVICE_URL', 'PRODUCCION_SERVICE_URL', 'BOLETAS_REPARACION_TOKEN'];
  const env = new Map(nombres.map((k) => [k, process.env[k]]));
  const dbOptions = AppDataSource.options as { host: string };
  const host = dbOptions.host;
  let inicializar: jest.SpyInstance;
  let destruir: jest.SpyInstance;
  let http: jest.SpyInstance;
  beforeEach(() => {
    dbOptions.host = '127.0.0.1';
    process.env.AUTH_SERVICE_URL = 'http://127.0.0.1:3001';
    process.env.PRODUCCION_SERVICE_URL = 'http://127.0.0.1:3002';
    process.env.BOLETAS_REPARACION_TOKEN = 'token-de-prueba';
    inicializar = jest.spyOn(DataSource.prototype, 'initialize').mockImplementation(async function () { return this; });
    destruir = jest.spyOn(DataSource.prototype, 'destroy').mockResolvedValue(undefined);
    http = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: '42', permisos: [{ codigo: 'logistica.boletas.gestionar' }],
    }), { status: 200 }));
    reparar.mockReset().mockResolvedValue({ modo: 'REVISION', modificadas: 0, plan: [] });
  });
  afterEach(() => {
    jest.restoreAllMocks(); dbOptions.host = host;
    for (const [key,value] of env) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  it('por defecto revisa; toma actor de Auth y cierra la conexión', async () => {
    await ejecutarReparacion(['--ids=3,8']);
    expect(http).toHaveBeenCalledWith(new URL('http://127.0.0.1:3001/me'), expect.objectContaining({ redirect: 'error' }));
    expect(reparar).toHaveBeenCalledWith(expect.any(DataSource), expect.anything(), ['3','8'], '42', 'Bearer token-de-prueba', false);
    expect(destruir).toHaveBeenCalledTimes(1);
  });
  it('solo --apply explícito habilita la escritura', async () => {
    await ejecutarReparacion(['--ids=3', '--apply']);
    expect(reparar.mock.calls[0][5]).toBe(true);
  });
  it('sin sesión no abre la base', async () => {
    delete process.env.BOLETAS_REPARACION_TOKEN;
    await expect(ejecutarReparacion(['--ids=3'])).rejects.toThrow('Falta BOLETAS_REPARACION_TOKEN');
    expect(inicializar).not.toHaveBeenCalled();
  });
  it.each([401,403])('Auth %s impide tocar datos', async (status) => {
    http.mockResolvedValueOnce(new Response('{}', { status }));
    await expect(ejecutarReparacion(['--ids=3'])).rejects.toThrow('Auth rechazó');
    expect(inicializar).not.toHaveBeenCalled();
    expect(reparar).not.toHaveBeenCalled();
  });
  it('sin permiso de gestión no abre la base', async () => {
    http.mockResolvedValueOnce(new Response(JSON.stringify({ id: '42', permisos: [] }), { status: 200 }));
    await expect(ejecutarReparacion(['--ids=3'])).rejects.toThrow('no tiene permiso');
    expect(inicializar).not.toHaveBeenCalled();
  });
  it.each(['base','Auth','Producción'])('rechaza %s fuera de localhost', async (destino) => {
    if (destino === 'base') dbOptions.host = 'db.example.invalid';
    if (destino === 'Auth') process.env.AUTH_SERVICE_URL = 'https://auth.example.invalid';
    if (destino === 'Producción') process.env.PRODUCCION_SERVICE_URL = 'https://produccion.example.invalid';
    await expect(ejecutarReparacion(['--ids=3'])).rejects.toThrow('limitado');
    expect(http).not.toHaveBeenCalled();
    expect(inicializar).not.toHaveBeenCalled();
  });
  it.each([[], ['--apply'], ['--ids=1','--ids=2'], ['--ids=1','--usuario=9']])('rechaza argumentos inválidos %j', async (...args) => {
    await expect(ejecutarReparacion(args)).rejects.toThrow('Uso:');
    expect(inicializar).not.toHaveBeenCalled();
  });
  it('cierra la conexión aunque falle la reparación', async () => {
    reparar.mockRejectedValueOnce(new Error('datos contradictorios'));
    await expect(ejecutarReparacion(['--ids=3','--apply'])).rejects.toThrow('datos contradictorios');
    expect(destruir).toHaveBeenCalledTimes(1);
  });
});
