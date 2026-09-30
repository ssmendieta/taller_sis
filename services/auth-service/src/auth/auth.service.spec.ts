import { strict as assert } from 'node:assert';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash as hashBcrypt } from 'bcrypt';
import { Repository } from 'typeorm';
import { Rol } from '../roles/entities/role.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AuthService } from './auth.service';

type UsuarioPrueba = Pick<
  Usuario,
  'id' | 'correo' | 'password_hash' | 'activo' | 'eliminado_en' | 'rol_id' | 'nombre_completo'
>;

function preparar(usuarios: UsuarioPrueba[]) {
  const payloads: Record<string, unknown>[] = [];
  const repositorioUsuarios = {
    createQueryBuilder: () => ({
      addSelect: () => ({
        where: (_sql: string, parametros: { correo: string }) => ({
          getOne: async () => usuarios.find(
            (usuario) => usuario.correo.toLowerCase() === parametros.correo,
          ) ?? null,
        }),
      }),
    }),
    findOne: async ({ where }: { where: { id: string } }) =>
      usuarios.find((u) => String(u.id) === String(where.id)) ?? null,
  } as unknown as Repository<Usuario>;
  const repositorioRoles = {
    findOne: async ({ where }: { where: { id: string } }) =>
      ['1', '2', '3', '4'].includes(where.id)
        ? { id: where.id, nombre: 'Administrador', activo: true, permisos: [
            { id: '7', nombre: 'Gestionar usuarios', codigo: 'usuarios.gestionar', activo: true },
            { id: '8', nombre: 'Permiso desactivado', codigo: 'ordenes.crear', activo: false },
          ] }
        : null,
  } as unknown as Repository<Rol>;
  const jwt = {
    signAsync: async (payload: Record<string, unknown>) => {
      payloads.push(payload);
      return 'jwt-de-prueba';
    },
  } as unknown as JwtService;
  return { servicio: new AuthService(jwt, repositorioUsuarios, repositorioRoles), payloads };
}

async function usuarioDePrueba(rolId = '1'): Promise<UsuarioPrueba> {
  return {
    id: '3',
    correo: 'ana@example.com',
    password_hash: await hashBcrypt('ClaveSegura123!', 4),
    nombre_completo: 'Ana',
    activo: true,
    eliminado_en: null,
    rol_id: rolId,
  };
}

describe('ABC-167: pruebas del servicio de autenticación', () => {
  it('inicia sesión sin distinguir mayúsculas y responde con rol y permisos', async () => {
    const { servicio, payloads } = preparar([await usuarioDePrueba()]);
    const respuesta = await servicio.login({ correo: ' ANA@EXAMPLE.COM ', password: 'ClaveSegura123!' });
    assert.equal(respuesta.accessToken, 'jwt-de-prueba');
    assert.equal(payloads[0].sub, '3');
    assert.equal(payloads[0].rolId, '1');
    assert.deepEqual(respuesta.usuario, {
      id: '3', correo: 'ana@example.com', nombre_completo: 'Ana',
      rol: { id: '1', nombre: 'Administrador' },
      permisos: [{ id: '7', codigo: 'usuarios.gestionar', nombre: 'Gestionar usuarios' }],
    });
    assert.equal('password_hash' in respuesta.usuario, false);
  });

  it('rechaza contraseña incorrecta, sin emitir token', async () => {
    const { servicio, payloads } = preparar([await usuarioDePrueba()]);
    await assert.rejects(
      () => servicio.login({ correo: 'ana@example.com', password: 'ContraseñaIncorrecta' }),
      UnauthorizedException,
    );
    assert.equal(payloads.length, 0);
  });

  it('rechaza usuario inexistente, sin emitir token', async () => {
    const { servicio, payloads } = preparar([]);
    await assert.rejects(
      () => servicio.login({ correo: 'ausente@example.com', password: 'ClaveSegura123!' }),
      UnauthorizedException,
    );
    assert.equal(payloads.length, 0);
  });

  it('rechaza cuentas inactivas o dadas de baja', async () => {
    for (const cambios of [{ activo: false }, { eliminado_en: new Date() }]) {
      const { servicio, payloads } = preparar([{ ...(await usuarioDePrueba()), ...cambios }]);
      await assert.rejects(
        () => servicio.login({ correo: 'ana@example.com', password: 'ClaveSegura123!' }),
        ForbiddenException,
      );
      assert.equal(payloads.length, 0);
    }
  });

  it('rechaza un rol inexistente, sin emitir token', async () => {
    const { servicio, payloads } = preparar([await usuarioDePrueba('999')]);
    await assert.rejects(
      () => servicio.login({ correo: 'ana@example.com', password: 'ClaveSegura123!' }),
      ForbiddenException,
    );
    assert.equal(payloads.length, 0);
  });

  it('incluye en el token el rol asignado al usuario', async () => {
    for (const rolId of ['1', '2', '3', '4']) {
      const { servicio, payloads } = preparar([await usuarioDePrueba(rolId)]);
      await servicio.login({ correo: 'ana@example.com', password: 'ClaveSegura123!' });
      assert.equal(payloads[0].rolId, rolId);
    }
  });

  it('devuelve el rol actual y solo permisos activos a un token ya validado', async () => {
    const { servicio } = preparar([await usuarioDePrueba()]);
    const respuesta = await servicio.sesionActual({ sub: '3', correo: 'ana@example.com', rolId: '1' });
    assert.deepEqual(respuesta, {
      id: '3',
      correo: 'ana@example.com',
      nombre_completo: 'Ana',
      rol: 'Administrador',
      permisos: [{ id: '7', codigo: 'usuarios.gestionar', nombre: 'Gestionar usuarios' }],
    });
    await assert.rejects(
      () => servicio.sesionActual({ sub: '3', correo: 'ana@example.com', rolId: '999' }),
      ForbiddenException,
    );
  });
});
