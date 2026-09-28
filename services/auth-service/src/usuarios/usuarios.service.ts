import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Rol } from '../roles/entities/role.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { Usuario } from './entities/usuario.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Rol)
    private readonly roles: Repository<Rol>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  private async validarRolActivo(rolId: number): Promise<void> {
    if (!Number.isSafeInteger(rolId) || rolId < 1) {
      throw new BadRequestException('El ID del rol debe ser un entero positivo');
    }
    const rol = await this.roles.findOne({ where: { id: String(rolId) } });
    if (!rol) throw new BadRequestException('El rol indicado no existe');
    if (!rol.activo) throw new BadRequestException('El rol indicado está inactivo');
  }

  private verificarCorreoDuplicado(error: unknown): never {
    if ((error as { driverError?: { constraint?: string } })?.driverError?.constraint === 'ux_usuarios_correo_ci') {
      throw new ConflictException('El correo ya está registrado');
    }
    throw error;
  }

  async create(dto: CreateUsuarioDto, actorId?: number): Promise<Usuario> {
    await this.validarRolActivo(dto.rol_id);
    const correo = dto.correo.trim().toLowerCase();
    if (await this.usuarios.createQueryBuilder('usuario')
      .where('LOWER(usuario.correo) = :correo', { correo }).getOne()) {
      throw new ConflictException('El correo ya está registrado');
    }
    const usuario = this.usuarios.create({
      nombre_completo: dto.nombre_completo.trim(),
      correo,
      rol_id: String(dto.rol_id),
      password_hash: await bcrypt.hash(dto.password, 10),
    });
    
    try {
      const guardado = await this.usuarios.save(usuario);
      const creado = await this.findOne(guardado.id);

      await this.auditoriaService.registrar({
        usuarioId: actorId ? String(actorId) : null,
        accion: 'CREACION_USUARIO',
        entidad: 'USUARIO',
        entidadId: creado.id,
        usuarioAfectadoId: creado.id,
        datosAntes: null,
        datosDespues: {
          id: creado.id,
          nombre_completo: creado.nombre_completo,
          correo: creado.correo,
          rol_id: creado.rol_id,
          activo: creado.activo,
        },
      });

      return creado;
    } catch (error) {
      this.verificarCorreoDuplicado(error);
    }
  }

  findAll(): Promise<Usuario[]> {
    return this.usuarios.find({ where: { eliminado_en: IsNull() } });
  }

  async rolesDisponibles(): Promise<Array<{ id: string; nombre: string }>> {
    const roles = await this.roles.find({ where: { activo: true }, order: { nombre: 'ASC' } });
    return roles.map(({ id, nombre }) => ({ id, nombre }));
  }

  async findOne(id: string): Promise<Usuario> {
    if (!/^[1-9]\d*$/.test(id)) throw new BadRequestException('ID de usuario inválido');
    const usuario = await this.usuarios.findOne({ where: { id, eliminado_en: IsNull() } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  async update(id: string, dto: UpdateUsuarioDto, actorId?: number): Promise<Usuario> {
    const usuario = await this.findOne(id);
    const datosAntes = {
      nombre_completo: usuario.nombre_completo,
      correo: usuario.correo,
      rol_id: usuario.rol_id,
    };

    const cambioRol = dto.rol_id !== undefined && String(dto.rol_id) !== usuario.rol_id;

    if (dto.rol_id !== undefined) {
      await this.validarRolActivo(dto.rol_id);
      usuario.rol_id = String(dto.rol_id);
    }
    if (dto.nombre_completo !== undefined) usuario.nombre_completo = dto.nombre_completo.trim();
    if (dto.correo !== undefined) {
      const correo = dto.correo.trim().toLowerCase();
      const repetido = await this.usuarios.createQueryBuilder('usuario')
        .where('LOWER(usuario.correo) = :correo', { correo }).getOne();
      if (repetido && repetido.id !== usuario.id) {
        throw new ConflictException('El correo ya está registrado');
      }
      usuario.correo = correo;
    }
    if (dto.password !== undefined) usuario.password_hash = await bcrypt.hash(dto.password, 10);

    try {
      await this.usuarios.save(usuario);
      const actualizado = await this.findOne(id);
      const datosDespues = {
        nombre_completo: actualizado.nombre_completo,
        correo: actualizado.correo,
        rol_id: actualizado.rol_id,
      };

      if (cambioRol) {
        await this.auditoriaService.registrar({
          usuarioId: actorId ? String(actorId) : null,
          accion: 'CAMBIO_ROL',
          entidad: 'USUARIO',
          entidadId: id,
          usuarioAfectadoId: id,
          datosAntes: { rol_id: datosAntes.rol_id },
          datosDespues: { rol_id: datosDespues.rol_id },
        });
      }

      if (dto.nombre_completo !== undefined || dto.correo !== undefined || dto.password !== undefined) {
        await this.auditoriaService.registrar({
          usuarioId: actorId ? String(actorId) : null,
          accion: 'MODIFICACION_USUARIO',
          entidad: 'USUARIO',
          entidadId: id,
          usuarioAfectadoId: id,
          datosAntes,
          datosDespues,
        });
      }

      return actualizado;
    } catch (error) {
      this.verificarCorreoDuplicado(error);
    }
  }

  async changeStatus(id: string, activo: boolean, actorId?: number): Promise<Usuario> {
    if (typeof activo !== 'boolean') throw new BadRequestException('activo debe ser booleano');
    const usuario = await this.findOne(id);
    const estadoAntes = usuario.activo;

    usuario.activo = activo;
    await this.usuarios.save(usuario);
    const actualizado = await this.findOne(id);

    await this.auditoriaService.registrar({
      usuarioId: actorId ? String(actorId) : null,
      accion: 'CAMBIO_ESTADO',
      entidad: 'USUARIO',
      entidadId: id,
      usuarioAfectadoId: id,
      datosAntes: { activo: estadoAntes },
      datosDespues: { activo: actualizado.activo },
    });

    return actualizado;
  }

  async softDelete(id: string, actorId?: number): Promise<void> {
    const usuario = await this.findOne(id);
    const fechaBaja = new Date();
    const estadoAntes = usuario.activo; 

    usuario.eliminado_en = fechaBaja;
    usuario.activo = false;
    await this.usuarios.save(usuario);

    await this.auditoriaService.registrar({
      usuarioId: actorId ? String(actorId) : null,
      accion: 'ELIMINACION_LOGICA',
      entidad: 'USUARIO',
      entidadId: id,
      usuarioAfectadoId: id,
      datosAntes: { activo: estadoAntes, eliminado_en: null },
      datosDespues: { activo: false, eliminado_en: fechaBaja },
    });
  }
}