import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { SesionGuard } from './sesion.guard';

describe('SesionGuard', () => {
  const guard = new SesionGuard();

  const fetchMock = jest.fn();

  function contexto(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function respuesta(status: number, cuerpo: unknown = { id: '7' }) {
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => cuerpo,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('rechaza la petición sin cabecera Authorization', async () => {
    await expect(guard.canActivate(contexto({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza una cabecera que no es un Bearer token', async () => {
    await expect(
      guard.canActivate(contexto({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza con 401 cuando Auth dice que la sesión ya no es válida', async () => {
    fetchMock.mockResolvedValue(respuesta(401));

    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: 'Bearer token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('responde 503 cuando Auth no responde', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));

    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: 'Bearer token' } }),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('acepta una sesión válida y registra el usuario en la petición', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { id: '42' }));

    const request: { headers: Record<string, string>; usuarioId?: number } = {
      headers: { authorization: 'Bearer token' },
    };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/me');
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } }),
    );
    expect(request.usuarioId).toBe(42);
  });
});
