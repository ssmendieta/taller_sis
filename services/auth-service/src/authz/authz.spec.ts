import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { PermisosGuard } from './permisos.guard';
import { REQUIERE_PERMISO_KEY } from './requiere-permiso.decorator';

function contextoMock(usuario: unknown) {
  const handler = jest.fn();
  const clase = jest.fn();
  return {
    getHandler: () => handler,
    getClass: () => clase,
    switchToHttp: () => ({
      getRequest: () => ({ user: usuario }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('AuthzModule (ABC-151)', () => {
  const getAllAndOverride = jest.fn();
  const rolFindOne = jest.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reflectorMock = { getAllAndOverride } as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rolRepoMock = { findOne: rolFindOne } as any;

  let guard: PermisosGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermisosGuard(reflectorMock, rolRepoMock);
  });

  it('sin @RequierePermiso deja pasar sin consultar roles', async () => {
    getAllAndOverride.mockReturnValue(undefined);

    await expect(
      guard.canActivate(contextoMock({ sub: 1, correo: 'a@b.c' })),
    ).resolves.toBe(true);
    expect(rolFindOne).not.toHaveBeenCalled();
  });

  it('token válido CON el permiso requerido → pasa', async () => {
    getAllAndOverride.mockReturnValue('ordenes.cambiar_estado');
    rolFindOne.mockResolvedValue({
      id: 1,
      permisos: [
        { codigo: 'ordenes.cambiar_estado', activo: true },
        { codigo: 'ordenes.consultar', activo: true },
      ],
    });

    await expect(
      guard.canActivate(contextoMock({ sub: 1, correo: 'a@b.c', rolId: 1 })),
    ).resolves.toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(REQUIERE_PERMISO_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('token válido SIN el permiso requerido → 403 genérico', async () => {
    getAllAndOverride.mockReturnValue('ordenes.cambiar_estado');
    rolFindOne.mockResolvedValue({
      id: 1,
      permisos: [{ codigo: 'ordenes.consultar', activo: true }],
    });

    const error = await guard
      .canActivate(contextoMock({ sub: 1, correo: 'a@b.c', rolId: 1 }))
      .catch((e) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.status).toBe(403);
    expect(error.message).toBe('No tiene permisos para realizar esta acción');
    expect(error.message).not.toContain('ordenes.cambiar_estado');
  });

  it('permiso inactivo en el rol → 403', async () => {
    getAllAndOverride.mockReturnValue('ordenes.cambiar_estado');
    rolFindOne.mockResolvedValue({
      id: 1,
      permisos: [{ codigo: 'ordenes.cambiar_estado', activo: false }],
    });

    await expect(
      guard.canActivate(contextoMock({ sub: 1, correo: 'a@b.c', rolId: 1 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('usuario autenticado sin rolId → 403', async () => {
    getAllAndOverride.mockReturnValue('ordenes.cambiar_estado');

    await expect(
      guard.canActivate(contextoMock({ sub: 1, correo: 'a@b.c' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rolFindOne).not.toHaveBeenCalled();
  });

  it('sin token → 401 (JwtAuthGuard)', () => {
    const jwtGuard = new JwtAuthGuard();

    // Sin token passport llama a fail con info (no con err) y sin usuario:
    // el guard responde 401 UnauthorizedException.
    expect(() =>
      jwtGuard.handleRequest(
        null,
        false,
        { message: 'No auth token' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      ),
    ).toThrow(UnauthorizedException);
  });

  it('la estrategia consulta el estado y el rol actual del usuario', async () => {
    const buscarUsuario = jest.fn().mockResolvedValue({
      id: '5', correo: 'actual@x.y', activo: true, eliminado_en: null, rol_id: '3',
    });
    const sesionesMock = { validarYRefrescar: jest.fn().mockResolvedValue(undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strategy = new JwtStrategy({ get: () => 'test-secret' } as any, { findOne: buscarUsuario } as any, sesionesMock as any);

    await expect(strategy.validate({ sub: 5, correo: 'anterior@x.y', rolId: 2, jti: 'jti-1' }))
      .resolves.toEqual({ sub: '5', correo: 'actual@x.y', rolId: '3', jti: 'jti-1' });
    expect(buscarUsuario).toHaveBeenCalledWith({ where: { id: '5' } });
    expect(sesionesMock.validarYRefrescar).toHaveBeenCalledWith('jti-1', '5');
    buscarUsuario.mockResolvedValueOnce({ id: '5', correo: 'actual@x.y', activo: false, eliminado_en: null, rol_id: '3' });
    await expect(strategy.validate({ sub: 5, correo: 'anterior@x.y', rolId: 2, jti: 'jti-1' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ sub: 5, correo: 'anterior@x.y', rolId: 2 }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
