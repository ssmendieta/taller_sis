import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Rol } from '../roles/entities/role.entity';
import { Usuario } from './entities/usuario.entity';
import { UsuariosService } from './usuarios.service';

function preparar() {
  const usuarios: Usuario[] = [];
  const roles = [
    { id: '1', nombre: 'Administrador', activo: true },
    { id: '2', nombre: 'Supervisor', activo: true },
    { id: '3', nombre: 'Deshabilitado', activo: false },
  ];

  const repoUsuarios = {
    create: (datos: Partial<Usuario>) => datos as Usuario,
    createQueryBuilder: () => ({
      where: (_sql: string, { correo }: { correo: string }) => ({
        getOne: async () => usuarios.find((usuario) => usuario.correo.toLowerCase() === correo) ?? null,
      }),
    }),
    find: async () => usuarios.filter((usuario) => !usuario.eliminado_en).map((usuario) => {
      const { password_hash: _hash, ...sinHash } = usuario;
      return sinHash as Usuario;
    }),
    findOne: async ({ where }: { where: { id: string } }) => {
      const encontrado = usuarios.find((usuario) => usuario.id === where.id && !usuario.eliminado_en);
      if (!encontrado) return null;
      const { password_hash: _hash, ...sinHash } = encontrado;
      return sinHash as Usuario;
    },
    save: async (usuario: Usuario) => {
      if (!usuario.id) usuario.id = String(usuarios.length + 1);
      const indice = usuarios.findIndex((actual) => actual.id === usuario.id);
      if (indice < 0) usuarios.push(usuario);
      else usuarios[indice] = { ...usuarios[indice], ...usuario };
      return usuario;
    },
  };
  const repoRoles = {
    findOne: async ({ where }: { where: { id: string } }) => roles.find((rol) => rol.id === where.id) ?? null,
    find: async () => roles.filter((rol) => rol.activo),
  };

  return {
    usuarios,
    service: new UsuariosService(
      repoUsuarios as unknown as Repository<Usuario>,
      repoRoles as unknown as Repository<Rol>,
    ),
  };
}

const datos = {
  nombre_completo: 'Usuario Prueba',
  correo: 'prueba@example.com',
  password: 'Prueba123!',
};

test('ABC-180: rechaza un rol que no existe', async () => {
  const { service, usuarios } = preparar();
  await assert.rejects(() => service.create({ ...datos, rol_id: 999 }), BadRequestException);
  assert.equal(usuarios.length, 0);
});

test('ABC-180: rechaza un rol inactivo', async () => {
  const { service, usuarios } = preparar();
  await assert.rejects(() => service.create({ ...datos, rol_id: 3 }), BadRequestException);
  assert.equal(usuarios.length, 0);
});

test('ABC-180: asigna un rol activo y no responde con el hash', async () => {
  const { service, usuarios } = preparar();
  const respuesta = await service.create({ ...datos, rol_id: 1 });
  assert.equal(usuarios[0].rol_id, '1');
  assert.equal(await bcrypt.compare(datos.password, usuarios[0].password_hash), true);
  assert.equal(Object.prototype.hasOwnProperty.call(respuesta, 'password_hash'), false);
});

test('ABC-180: cambia a otro rol activo y rechaza después uno inactivo', async () => {
  const { service, usuarios } = preparar();
  await service.create({ ...datos, rol_id: 1 });
  await service.update('1', { rol_id: 2 });
  assert.equal(usuarios[0].rol_id, '2');
  await assert.rejects(() => service.update('1', { rol_id: 3 }), BadRequestException);
  assert.equal(usuarios[0].rol_id, '2');
});

test('ABC-180: ofrece solo los roles activos', async () => {
  const { service } = preparar();
  const roles = await service.rolesDisponibles();
  assert.deepEqual(roles, [
    { id: '1', nombre: 'Administrador' },
    { id: '2', nombre: 'Supervisor' },
  ]);
});

test('ABC-165: no permite registrar dos usuarios con el mismo correo, ignorando mayúsculas', async () => {
  const { service, usuarios } = preparar();
  await service.create({ ...datos, rol_id: 1 });
  await assert.rejects(
    () => service.create({ ...datos, correo: 'PRUEBA@EXAMPLE.COM', rol_id: 1 }),
    ConflictException,
  );
  assert.equal(usuarios.length, 1);
});

test('ABC-165: permite editar el nombre y el correo de un usuario existente', async () => {
  const { service, usuarios } = preparar();
  await service.create({ ...datos, rol_id: 1 });
  const editado = await service.update('1', {
    nombre_completo: 'Nombre Modificado',
    correo: 'nuevo@example.com',
  });
  assert.equal(editado.nombre_completo, 'Nombre Modificado');
  assert.equal(usuarios[0].correo, 'nuevo@example.com');
  assert.equal((await service.findOne('1')).correo, 'nuevo@example.com');
});

test('ABC-165: desactiva, consulta y da de baja lógica al usuario', async () => {
  const { service, usuarios } = preparar();
  await service.create({ ...datos, rol_id: 1 });
  const desactivado = await service.changeStatus('1', false);
  assert.equal(desactivado.activo, false);
  assert.equal((await service.findAll()).length, 1);
  await service.softDelete('1');
  assert.equal(usuarios[0].activo, false);
  assert.equal(usuarios[0].eliminado_en instanceof Date, true);
  assert.deepEqual(await service.findAll(), []);
  await assert.rejects(() => service.findOne('1'), NotFoundException);
});
