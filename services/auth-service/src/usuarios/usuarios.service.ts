import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
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

  private normalizarNombreCompleto(nombre: string): string {
    const nombreNormalizado = nombre.trim();
    if (!nombreNormalizado) {
      throw new BadRequestException('El nombre completo es obligatorio');
    }
    return nombreNormalizado;
  }

  async create(dto: CreateUsuarioDto, actorId?: string | number): Promise<Usuario> {
    const nombreCompleto = this.normalizarNombreCompleto(dto.nombre_completo);
    await this.validarRolActivo(dto.rol_id);
    const correo = dto.correo.trim().toLowerCase();
    if (await this.usuarios.createQueryBuilder('usuario')
      .where('LOWER(usuario.correo) = :correo', { correo }).getOne()) {
      throw new ConflictException('El correo ya está registrado');
    }
    const usuario = this.usuarios.create({
      nombre_completo: nombreCompleto,
      correo,
      rol_id: String(dto.rol_id),
      password_hash: await bcrypt.hash(dto.password, 10),
    });
    
    try {
      return await this.dataSource.transaction(async (manager) => {
        const usuarios = manager.getRepository(Usuario);
        const guardado = await usuarios.save(usuario);
        const creado = await usuarios.findOne({
          where: { id: guardado.id, eliminado_en: IsNull() },
        });
        if (!creado) throw new NotFoundException('Usuario no encontrado');

        await this.auditoriaService.registrar({
          usuarioId: actorId != null ? String(actorId) : null,
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
        }, manager);

        return creado;
      });
    } catch (error) {
      this.verificarCorreoDuplicado(error);
    }
  }

  findAll(): Promise<Usuario[]> {
    return this.usuarios.find({ where: { eliminado_en: IsNull() } });
  }

  findAllIncluyendoBajas(): Promise<Usuario[]> {
    return this.usuarios.find({ order: { id: 'ASC' } });
  }

  private async nombreRolDe(rolId: string | number): Promise<string | null> {
    const rol = await this.roles.findOne({ where: { id: String(rolId) } });
    return rol?.nombre ?? null;
  }

  private async contarAdminsActivos(excluirId?: string | number): Promise<number> {
    const qb = this.usuarios
      .createQueryBuilder('u')
      .innerJoin(Rol, 'r', 'r.id = u.rol_id')
      .where('r.nombre = :admin', { admin: 'Administrador' })
      .andWhere('u.activo = TRUE')
      .andWhere('u.eliminado_en IS NULL');
    if (excluirId !== undefined) {
      qb.andWhere('u.id != :excluir', { excluir: String(excluirId) });
    }
    return qb.getCount();
  }

  private async protegerAdmin(
    objetivoId: string | number,
    actorId?: string | number,
  ): Promise<void> {
    const objetivo = await this.usuarios.findOne({
      where: { id: String(objetivoId) },
    });
    if (!objetivo) return;
    const esAdmin = (await this.nombreRolDe(objetivo.rol_id)) === 'Administrador';
    if (!esAdmin) return;
    if (actorId !== undefined && String(actorId) === String(objetivoId)) {
      throw new ConflictException('No puedes desactivar ni dar de baja tu propia cuenta');
    }
    const otros = await this.contarAdminsActivos(objetivoId);
    if (otros < 1) {
      throw new ConflictException(
        'No se puede dejar el sistema sin un Administrador activo',
      );
    }
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

  async update(id: string, dto: UpdateUsuarioDto, actorId?: string | number): Promise<Usuario> {
    const usuario = await this.findOne(id);
    const datosAntes = {
      nombre_completo: usuario.nombre_completo,
      correo: usuario.correo,
      rol_id: usuario.rol_id,
    };

    const cambioRol = dto.rol_id !== undefined && String(dto.rol_id) !== usuario.rol_id;

    if (dto.rol_id !== undefined) {
      await this.validarRolActivo(dto.rol_id);
      if (cambioRol) {
        const rolActual = await this.nombreRolDe(usuario.rol_id);
        const rolNuevo = await this.nombreRolDe(dto.rol_id);
        if (rolActual === 'Administrador' && rolNuevo !== 'Administrador') {
          await this.protegerAdmin(id, actorId);
        }
      }
      usuario.rol_id = String(dto.rol_id);
    }
    if (dto.nombre_completo !== undefined) {
      usuario.nombre_completo = this.normalizarNombreCompleto(dto.nombre_completo);
    }
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
      return await this.dataSource.transaction(async (manager) => {
        const usuarios = manager.getRepository(Usuario);
        await usuarios.save(usuario);
        const resultado = await usuarios.findOne({
          where: { id, eliminado_en: IsNull() },
        });
        if (!resultado) throw new NotFoundException('Usuario no encontrado');
        const datosDespues = {
          nombre_completo: resultado.nombre_completo,
          correo: resultado.correo,
          rol_id: resultado.rol_id,
        };

        if (cambioRol) {
          await this.auditoriaService.registrar({
            usuarioId: actorId != null ? String(actorId) : null,
            accion: 'CAMBIO_ROL',
            entidad: 'USUARIO',
            entidadId: id,
            usuarioAfectadoId: id,
            datosAntes: { rol_id: datosAntes.rol_id },
            datosDespues: { rol_id: datosDespues.rol_id },
          }, manager);
        }

        if (dto.nombre_completo !== undefined || dto.correo !== undefined || dto.password !== undefined) {
          await this.auditoriaService.registrar({
            usuarioId: actorId != null ? String(actorId) : null,
            accion: 'MODIFICACION_USUARIO',
            entidad: 'USUARIO',
            entidadId: id,
            usuarioAfectadoId: id,
            datosAntes,
            datosDespues,
          }, manager);
        }

        return resultado;
      });
    } catch (error) {
      this.verificarCorreoDuplicado(error);
    }
  }

  async changeStatus(id: string, activo: boolean, actorId?: string | number): Promise<Usuario> {
    if (typeof activo !== 'boolean') throw new BadRequestException('activo debe ser booleano');
    const usuario = await this.findOne(id);
    if (activo === false) {
      await this.protegerAdmin(id, actorId);
    }
    const estadoAntes = usuario.activo;

    return this.dataSource.transaction(async (manager) => {
      const usuarios = manager.getRepository(Usuario);
      usuario.activo = activo;
      await usuarios.save(usuario);
      const actualizado = await usuarios.findOne({
        where: { id, eliminado_en: IsNull() },
      });
      if (!actualizado) throw new NotFoundException('Usuario no encontrado');

      await this.auditoriaService.registrar({
        usuarioId: actorId != null ? String(actorId) : null,
        accion: 'CAMBIO_ESTADO',
        entidad: 'USUARIO',
        entidadId: id,
        usuarioAfectadoId: id,
        datosAntes: { activo: estadoAntes },
        datosDespues: { activo: actualizado.activo },
      }, manager);

      return actualizado;
    });
  }

  async softDelete(id: string, actorId?: string | number): Promise<void> {
    const usuario = await this.findOne(id);
    await this.protegerAdmin(id, actorId);
    const fechaBaja = new Date();
    const estadoAntes = usuario.activo; 

    await this.dataSource.transaction(async (manager) => {
      const usuarios = manager.getRepository(Usuario);
      usuario.eliminado_en = fechaBaja;
      usuario.activo = false;
      await usuarios.save(usuario);

      await this.auditoriaService.registrar({
        usuarioId: actorId != null ? String(actorId) : null,
        accion: 'ELIMINACION_LOGICA',
        entidad: 'USUARIO',
        entidadId: id,
        usuarioAfectadoId: id,
        datosAntes: { activo: estadoAntes, eliminado_en: null },
        datosDespues: { activo: false, eliminado_en: fechaBaja },
      }, manager);
    });
  }
}
