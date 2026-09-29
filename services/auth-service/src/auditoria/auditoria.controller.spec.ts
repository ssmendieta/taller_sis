import { describe, it, expect, jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FindOneOptions, Repository } from 'typeorm';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';
import { JwtAuthGuard } from '../authz/jwt-auth.guard';
import { PermisosGuard } from '../authz/permisos.guard';
import { REQUIERE_PERMISO_KEY } from '../authz/requiere-permiso.decorator';
import { Rol } from '../roles/entities/role.entity';

function contexto(usuario: unknown): ExecutionContext {
  const handler = jest.fn();
  return {
    getHandler: () => handler,
    getClass: () => AuditoriaController,
    switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }),
  } as unknown as ExecutionContext;
}

describe('AuditoriaController', () => {
  it('debe estar definido', () => {
    expect(new AuditoriaController({} as AuditoriaService)).toBeDefined();
  });

  it('protege el endpoint con JWT y el permiso de consulta de auditoría', () => {
    expect(Reflect.getMetadata('__guards__', AuditoriaController)).toEqual([
      JwtAuthGuard,
      PermisosGuard,
    ]);
    expect(Reflect.getMetadata(REQUIERE_PERMISO_KEY, AuditoriaController)).toBe(
      'auditoria.consultar',
    );
  });

  it('permite el acceso cuando el rol autenticado tiene auditoria.consultar', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('auditoria.consultar'),
    };
    let lookup: FindOneOptions<Rol> | undefined;
    const roleRepository = {
      findOne: async (options: FindOneOptions<Rol>) => {
        lookup = options;
        return {
          id: '1',
          permisos: [{ codigo: 'auditoria.consultar', activo: true }],
        } as Rol;
      },
    };
    const guard = new PermisosGuard(
      reflector as unknown as Reflector,
      roleRepository as unknown as Repository<Rol>,
    );

    await expect(guard.canActivate(contexto({ sub: '7', rolId: '1' }))).resolves.toBe(
      true,
    );
    expect(lookup).toEqual({
      where: { id: '1' },
      relations: { permisos: true },
    });
  });

  it('rechaza el acceso cuando el rol no tiene auditoria.consultar', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('auditoria.consultar'),
    };
    const roleRepository = {
      findOne: async (_options: FindOneOptions<Rol>) => ({
        id: '2',
        permisos: [{ codigo: 'usuarios.gestionar', activo: true }],
      }) as Rol,
    };
    const guard = new PermisosGuard(
      reflector as unknown as Reflector,
      roleRepository as unknown as Repository<Rol>,
    );

    await expect(
      guard.canActivate(contexto({ sub: '8', rolId: '2' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
