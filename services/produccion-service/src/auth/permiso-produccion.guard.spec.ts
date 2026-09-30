import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermisoProduccionGuard } from './permiso-produccion.guard';
import { OrdenesController } from '../ordenes/ordenes.controller';
import { AvancesProduccionController } from '../avances_produccion/avances_produccion.controller';

describe('ABC-119/192/197: Auth valida los permisos actuales en Producción', () => {
  const guard = new PermisoProduccionGuard(new Reflector());
  const fetchOriginal = global.fetch;

  afterEach(() => { global.fetch = fetchOriginal; });

  function contexto(
    controller: typeof OrdenesController | typeof AvancesProduccionController,
    metodo: 'create' | 'cambiarEstado',
    authorization?: string,
    body?: { nuevoEstado?: string },
  ) {
    const request = { headers: { authorization }, body, usuarioId: undefined as number | undefined, usuarioAutenticado: undefined as unknown };
    const context = {
      getHandler: () => controller.prototype[metodo],
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  function auth(rol: string, permisos: string[], id = '7') {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id, rol, permisos }),
    });
  }

  it('rechaza crear una orden sin sesión, sin consultar a Auth', async () => {
    const consulta = jest.fn();
    global.fetch = consulta as unknown as typeof fetch;
    await expect(guard.canActivate(contexto(OrdenesController, 'create').context))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('decide solo por permiso: un rol personalizado con el permiso pasa', async () => {
    auth('Supervisor', ['ordenes.crear']);
    const personalizado = contexto(OrdenesController, 'create', 'Bearer token');
    expect(await guard.canActivate(personalizado.context)).toBe(true);
    expect(personalizado.request.usuarioId).toBe(7);
    auth('Encargado de Producción', []);
    await expect(guard.canActivate(contexto(OrdenesController, 'create', 'Bearer token').context))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('acepta permisos como objetos {codigo} y expone el nombre del usuario', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: '7',
        rol: 'Auditor',
        nombre_completo: 'Ana Pérez',
        permisos: [{ id: '1', codigo: 'ordenes.crear', nombre: 'Crear' }],
      }),
    });
    const orden = contexto(OrdenesController, 'create', 'Bearer token');
    expect(await guard.canActivate(orden.context)).toBe(true);
    expect(orden.request.usuarioAutenticado).toMatchObject({ sub: 7, nombre: 'Ana Pérez' });
  });

  it('usa el ID obtenido de Auth al crear y comprueba el permiso específico del cierre', async () => {
    auth('Encargado de Producción', ['ordenes.crear', 'ordenes.finalizar_cancelar']);
    const orden = contexto(OrdenesController, 'create', 'Bearer token');
    expect(await guard.canActivate(orden.context)).toBe(true);
    expect(orden.request.usuarioId).toBe(7);
    expect(global.fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      headers: { Authorization: 'Bearer token' },
    }));
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toMatch(/\/me$/);
    const cierre = contexto(OrdenesController, 'cambiarEstado', 'Bearer token', { nuevoEstado: 'CANCELADA' });
    expect(await guard.canActivate(cierre.context)).toBe(true);
  });

  it('impide registrar avances si el usuario no tiene ese permiso', async () => {
    auth('Encargado de Producción', ['ordenes.crear']);
    await expect(guard.canActivate(contexto(AvancesProduccionController, 'create', 'Bearer token').context))
      .rejects.toBeInstanceOf(ForbiddenException);
    auth('Encargado de Producción', ['ordenes.registrar_avance']);
    const avance = contexto(AvancesProduccionController, 'create', 'Bearer token');
    expect(await guard.canActivate(avance.context)).toBe(true);
    expect(avance.request.usuarioId).toBe(7);
  });

  it('si Auth rechaza o no responde, no registra la operación', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false });
    await expect(guard.canActivate(contexto(OrdenesController, 'create', 'Bearer token').context))
      .rejects.toBeInstanceOf(UnauthorizedException);
    global.fetch = jest.fn().mockRejectedValue(new Error('Sin conexión'));
    await expect(guard.canActivate(contexto(OrdenesController, 'create', 'Bearer token').context))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
