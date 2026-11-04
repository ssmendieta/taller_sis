import { describe, expect, it } from '@jest/globals';
import { PermisosGuard } from '../authz/permisos.guard';
import { JwtAuthGuard } from '../authz/jwt-auth.guard';
import { UsuariosController } from './usuarios.controller';

describe('UsuariosController (ABC-164)', () => {
  it('requiere autenticación y el permiso de gestión de usuarios', () => {
    expect(Reflect.getMetadata('requiere_permiso', UsuariosController)).toBe(
      'usuarios.gestionar',
    );
    expect(Reflect.getMetadata('__guards__', UsuariosController)).toEqual([
      JwtAuthGuard,
      PermisosGuard,
    ]);
  });
});
