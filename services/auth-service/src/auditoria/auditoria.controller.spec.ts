import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';
import { REQUIERE_PERMISO_KEY } from '../authz/requiere-permiso.decorator';
import { PermisosGuard } from '../authz/permisos.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { Rol } from '../roles/entities/role.entity';

describe('ABC-186: acceso a la auditoría', () => {
  it('ofrece lectura al permiso auditoria.consultar, sin rutas para modificar o eliminar', async () => {
    const servicio = { findAll: jest.fn().mockResolvedValue([{ accion: 'CREAR_USUARIO' }]) };
    const controller = new AuditoriaController(servicio as unknown as AuditoriaService);
    expect(Reflect.getMetadata(REQUIERE_PERMISO_KEY, AuditoriaController)).toBe('auditoria.consultar');
    expect(Object.getOwnPropertyNames(AuditoriaController.prototype).sort()).toEqual(
      ['constructor', 'findAll', 'findOne'].sort(),
    );
    await expect(controller.findAll()).resolves.toEqual([{ accion: 'CREAR_USUARIO' }]);
  });

  it('deniega al no administrador y admite al rol con auditoria.consultar', async () => {
    let rol: Partial<Rol> = { activo: true, permisos: [] };
    const repositorio = { findOne: async () => rol } as unknown as Repository<Rol>;
    const guard = new PermisosGuard(new Reflector(), repositorio);
    const contexto = {
      getHandler: () => AuditoriaController.prototype.findAll,
      getClass: () => AuditoriaController,
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: '2', rolId: '2' } }) }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(ForbiddenException);
    rol = { activo: true, permisos: [{ codigo: 'auditoria.consultar', activo: true } as never] };
    await expect(guard.canActivate(contexto)).resolves.toBe(true);
  });
});
