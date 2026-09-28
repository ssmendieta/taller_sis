import { describe, it, expect, jest } from '@jest/globals';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Rol } from '../roles/entities/role.entity';
import { Usuario } from './entities/usuario.entity';
import { UsuariosService } from './usuarios.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('UsuariosService', () => {
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

    const mockAuditoriaService = {
      registrar: jest.fn().mockImplementation(async () => {}),
    };

    return {
      usuarios,
      mockAuditoriaService,
      service: new UsuariosService(
        repoUsuarios as unknown as Repository<Usuario>,
        repoRoles as unknown as Repository<Rol>,
        mockAuditoriaService as unknown as AuditoriaService,
      ),
    };
  }

  const datos = {
    nombre_completo: 'Usuario Prueba',
    correo: 'prueba@example.com',
    password: 'Prueba123!',
  };

  // --- TESTS ORIGINALES DE ABC-180 y ABC-165 ---

  it('ABC-180: rechaza un rol que no existe', async () => {
    const { service, usuarios } = preparar();
    await expect(service.create({ ...datos, rol_id: 999 } as any)).rejects.toThrow(BadRequestException);
    expect(usuarios.length).toBe(0);
  });

  it('ABC-180: rechaza un rol inactivo', async () => {
    const { service, usuarios } = preparar();
    await expect(service.create({ ...datos, rol_id: 3 } as any)).rejects.toThrow(BadRequestException);
    expect(usuarios.length).toBe(0);
  });

  it('ABC-180: asigna un rol activo y no responde con el hash', async () => {
    const { service, usuarios } = preparar();
    const respuesta = await service.create({ ...datos, rol_id: 1 } as any);
    expect(usuarios[0].rol_id).toBe('1');
    expect(await bcrypt.compare(datos.password, usuarios[0].password_hash)).toBe(true);
    expect(respuesta).not.toHaveProperty('password_hash');
  });

  it('ABC-180: cambia a otro rol activo y rechaza después uno inactivo', async () => {
    const { service, usuarios } = preparar();
    await service.create({ ...datos, rol_id: 1 } as any);
    await service.update('1', { rol_id: 2 } as any);
    expect(usuarios[0].rol_id).toBe('2');
    await expect(service.update('1', { rol_id: 3 } as any)).rejects.toThrow(BadRequestException);
    expect(usuarios[0].rol_id).toBe('2');
  });

  it('ABC-180: ofrece solo los roles activos', async () => {
    const { service } = preparar();
    const roles = await service.rolesDisponibles();
    expect(roles).toEqual([
      { id: '1', nombre: 'Administrador' },
      { id: '2', nombre: 'Supervisor' },
    ]);
  });

  it('ABC-165: no permite registrar dos usuarios con el mismo correo, ignorando mayúsculas', async () => {
    const { service, usuarios } = preparar();
    await service.create({ ...datos, rol_id: 1 } as any);
    await expect(
      service.create({ ...datos, correo: 'PRUEBA@EXAMPLE.COM', rol_id: 1 } as any)
    ).rejects.toThrow(ConflictException);
    expect(usuarios.length).toBe(1);
  });

  it('ABC-165: permite editar el nombre y el correo de un usuario existente', async () => {
    const { service, usuarios } = preparar();
    await service.create({ ...datos, rol_id: 1 } as any);
    const editado = await service.update('1', {
      nombre_completo: 'Nombre Modificado',
      correo: 'nuevo@example.com',
    });
    expect(editado.nombre_completo).toBe('Nombre Modificado');
    expect(usuarios[0].correo).toBe('nuevo@example.com');
  });

  it('ABC-165: desactiva, consulta y da de baja lógica al usuario', async () => {
    const { service, usuarios } = preparar();
    await service.create({ ...datos, rol_id: 1 } as any);
    
    await service.changeStatus('1', false);
    await service.softDelete('1');
    expect(usuarios[0].activo).toBe(false);
    expect(usuarios[0].eliminado_en instanceof Date).toBe(true);
    await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
  });

  // --- NUEVOS TESTS DE AUDITORÍA (ABC-164) ---

  it('ABC-164: audita la creación de un usuario', async () => {
    const { service, mockAuditoriaService } = preparar();
    const creado = await service.create({ ...datos, rol_id: 1 } as any, 42); // Actor ID = 42
    
    expect(mockAuditoriaService.registrar).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'CREACION_USUARIO',
      usuarioId: '42',
      usuarioAfectadoId: creado.id,
    }));
  });

  it('ABC-164: audita la modificación de datos de un usuario', async () => {
    const { service, mockAuditoriaService } = preparar();
    await service.create({ ...datos, rol_id: 1 } as any);
    mockAuditoriaService.registrar.mockClear(); // Limpiamos la llamada del create anterior

    await service.update('1', { nombre_completo: 'Nuevo Nombre' }, 42);
    
    expect(mockAuditoriaService.registrar).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'MODIFICACION_USUARIO',
      usuarioId: '42',
      usuarioAfectadoId: '1',
    }));
  });

  it('ABC-164: audita el cambio de estado', async () => {
    const { service, mockAuditoriaService } = preparar();
    await service.create({ ...datos, rol_id: 1 } as any);
    mockAuditoriaService.registrar.mockClear();

    await service.changeStatus('1', false, 42);
    
    expect(mockAuditoriaService.registrar).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'CAMBIO_ESTADO',
      usuarioId: '42',
      usuarioAfectadoId: '1',
    }));
  });

  it('ABC-164: audita la eliminación lógica registrando su estado previo real', async () => {
    const { service, mockAuditoriaService } = preparar();
    await service.create({ ...datos, rol_id: 1 } as any);
    await service.changeStatus('1', false); // Lo desactivamos primero
    mockAuditoriaService.registrar.mockClear();

    await service.softDelete('1', 42);
    
    expect(mockAuditoriaService.registrar).toHaveBeenCalledWith(expect.objectContaining({
      accion: 'ELIMINACION_LOGICA',
      usuarioId: '42',
      datosAntes: expect.objectContaining({ activo: false }), // Validamos que capture que ya estaba inactivo
    }));
  });
});