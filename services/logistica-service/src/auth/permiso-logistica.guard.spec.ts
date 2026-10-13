import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from './permiso-logistica.guard';

describe('PermisoLogisticaGuard (unitario; Auth simulado)', () => {
  const fetchOriginal = global.fetch;
  const authUrlOriginal = process.env.AUTH_SERVICE_URL;
  const requiredPermission = 'logistica.boletas.consultar';
  let fetchMock: jest.Mock;
  let reflector: { get: jest.Mock };
  let request: { headers: { authorization?: string }; usuarioId?: string };
  let guard: PermisoLogisticaGuard;
  let handler: object;

  function context() {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
    } as any;
  }

  function respuesta(status: number, body: unknown) {
    return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
  }

  beforeEach(() => {
    handler = {};
    request = { headers: { authorization: 'Bearer test-token' } };
    reflector = { get: jest.fn().mockReturnValue(requiredPermission) };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    guard = new PermisoLogisticaGuard(reflector as any);
    process.env.AUTH_SERVICE_URL = 'http://auth.test/api/';
  });

  afterAll(() => {
    global.fetch = fetchOriginal;
    if (authUrlOriginal === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = authUrlOriginal;
  });

  it('rechaza token ausente o malformado con 401 sin llamar Auth', async () => {
    request.headers.authorization = undefined;
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
    request.headers.authorization = 'Basic abc';
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consulta el /me real con Bearer y timeout de 3 segundos; conserva id de bigint', async () => {
    fetchMock.mockResolvedValue(respuesta(200, {
      id: '9007199254740993', rol: 'Encargado de Logística',
      permisos: [{ codigo: requiredPermission }],
    }));
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(new URL('me', 'http://auth.test/api/'), expect.objectContaining({
      headers: { Authorization: 'Bearer test-token' },
      signal: expect.any(AbortSignal),
    }));
    expect(request.usuarioId).toBe('9007199254740993');
    expect(reflector.get).toHaveBeenCalledWith(PERMISO_LOGISTICA, handler);
  });

  it('permite consulta al Supervisor con el código de permiso de consulta', async () => {
    fetchMock.mockResolvedValue(respuesta(200, {
      id: '5', rol: 'Supervisor', permisos: [{ codigo: 'logistica.boletas.consultar' }],
    }));
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('rechaza crear para Supervisor cuando Auth solo devuelve permiso de consulta', async () => {
    reflector.get.mockReturnValue('logistica.boletas.gestionar');
    fetchMock.mockResolvedValue(respuesta(200, {
      id: '5', rol: 'Supervisor', permisos: [{ codigo: 'logistica.boletas.consultar' }],
    }));
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite escribir al Encargado con el permiso de gestión', async () => {
    reflector.get.mockReturnValue('logistica.boletas.gestionar');
    fetchMock.mockResolvedValue(respuesta(200, {
      id: '8', rol: 'Encargado de Logística', permisos: [
        { codigo: 'logistica.boletas.gestionar' }, { codigo: 'logistica.boletas.consultar' },
      ],
    }));
    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('distingue token inválido (401), ausencia de permiso (403) y Auth no disponible (503)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(401, {}));
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
    fetchMock.mockResolvedValueOnce(respuesta(200, { id: '9', permisos: [] }));
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ServiceUnavailableException);
    fetchMock.mockResolvedValueOnce({
      status: 200, ok: true, json: async () => { throw new Error('json inválido'); },
    } as unknown as Response);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ServiceUnavailableException);
    fetchMock.mockResolvedValueOnce(respuesta(503, {}));
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ServiceUnavailableException);
    fetchMock.mockResolvedValueOnce(respuesta(200, { id: '9', permisos: 'inválido' }));
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('usa solo códigos de permisos y no concede acceso por el nombre del rol', async () => {
    fetchMock.mockResolvedValue(respuesta(200, {
      id: '10', rol: 'Encargado de Logística', permisos: [],
    }));
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
