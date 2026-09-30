import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Rol } from './entities/role.entity';
import { Permisos } from '../permisos/entities/permiso.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const PERMISOS_ADMIN_OBLIGATORIOS = [
  'usuarios.gestionar',
  'roles_permisos.gestionar',
];

function resumenRol(rol: Rol) {
  return {
    id: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion ?? null,
    activo: rol.activo,
    permisos: (rol.permisos ?? []).map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
    })),
  };
}

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Rol)
    private readonly roles: Repository<Rol>,
    @InjectRepository(Permisos)
    private readonly permisosRepo: Repository<Permisos>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  findAll() {
    return this.roles.find({
      relations: ['permisos'],
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number) {
    const rol = await this.roles.findOne({
      where: { id: String(id) },
      relations: ['permisos'],
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  async create(dto: CreateRoleDto, actorId?: string | number | null) {
    const nombre = dto.nombre.trim();
    const existente = await this.roles.findOne({ where: { nombre } });
    if (existente) {
      throw new ConflictException('Ya existe un rol con ese nombre');
    }
    let creado!: Rol;
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Rol);
      creado = await repo.save(
        repo.create({
          nombre,
          descripcion: dto.descripcion?.trim() || null,
          activo: dto.activo ?? true,
        }),
      );
      await this.auditoria.registrar(
        {
          usuarioId: actorId ?? null,
          accion: 'CREACION_ROL',
          entidad: 'roles',
          entidadId: creado.id,
          datosAntes: null,
          datosDespues: resumenRol({ ...creado, permisos: [] }),
        },
        manager,
      );
    });
    return this.findOne(Number(creado.id));
  }

  async update(
    id: number,
    dto: UpdateRoleDto,
    actorId?: string | number | null,
  ) {
    const rol = await this.findOne(id);
    const antes = resumenRol(rol);
    if (
      rol.nombre === 'Administrador' &&
      dto.nombre !== undefined &&
      dto.nombre.trim() !== 'Administrador'
    ) {
      throw new ConflictException('No se puede renombrar el rol Administrador');
    }
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) {
        throw new ConflictException('El nombre del rol no puede estar vacío');
      }
      const otro = await this.roles.findOne({ where: { nombre } });
      if (otro && String(otro.id) !== String(rol.id)) {
        throw new ConflictException('Ya existe un rol con ese nombre');
      }
      rol.nombre = nombre;
    }
    if (dto.descripcion !== undefined) {
      rol.descripcion = dto.descripcion?.trim() || null;
    }
    if (dto.activo !== undefined) {
      if (dto.activo === false) {
        await this.verificarSinUsuariosActivos(rol.id);
      }
      rol.activo = dto.activo;
    }
    let guardado!: Rol;
    await this.dataSource.transaction(async (manager) => {
      guardado = await manager.getRepository(Rol).save(rol);
      await this.auditoria.registrar(
        {
          usuarioId: actorId ?? null,
          accion: 'MODIFICACION_ROL',
          entidad: 'roles',
          entidadId: rol.id,
          datosAntes: antes,
          datosDespues: resumenRol(guardado),
        },
        manager,
      );
    });
    return this.findOne(Number(rol.id));
  }

  async reemplazarPermisos(
    id: number,
    permisoIds: number[],
    actorId?: string | number | null,
  ) {
    const rol = await this.findOne(id);
    const antes = resumenRol(rol);
    const unicos = [...new Set(permisoIds.map(Number))];
    const permisos =
      unicos.length === 0
        ? []
        : await this.permisosRepo
            .createQueryBuilder('p')
            .where('p.id IN (:...ids)', { ids: unicos })
            .getMany();
    if (permisos.length !== unicos.length) {
      throw new NotFoundException('Uno o más permisos no existen');
    }
    if (rol.nombre === 'Administrador') {
      const codigos = permisos.map((p) => p.codigo);
      const faltan = PERMISOS_ADMIN_OBLIGATORIOS.filter(
        (c) => !codigos.includes(c),
      );
      if (faltan.length > 0) {
        throw new ConflictException(
          `El rol Administrador debe conservar: ${faltan.join(', ')}`,
        );
      }
    }
    let guardado!: Rol;
    await this.dataSource.transaction(async (manager) => {
      rol.permisos = permisos;
      guardado = await manager.getRepository(Rol).save(rol);
      await this.auditoria.registrar(
        {
          usuarioId: actorId ?? null,
          accion: 'CAMBIO_PERMISOS_ROL',
          entidad: 'roles',
          entidadId: rol.id,
          datosAntes: antes,
          datosDespues: resumenRol(guardado),
        },
        manager,
      );
    });
    return this.findOne(Number(rol.id));
  }

  async desactivar(id: number, actorId?: string | number | null) {
    return this.update(id, { activo: false }, actorId);
  }

  remove() {
    throw new ForbiddenException(
      'No se permite eliminar roles. Use PATCH para desactivar.',
    );
  }

  private async verificarSinUsuariosActivos(rolId: string | number) {
    const total = await this.usuarios
      .createQueryBuilder('u')
      .where('u.rol_id = :rolId', { rolId: String(rolId) })
      .andWhere('u.activo = TRUE')
      .andWhere('u.eliminado_en IS NULL')
      .getCount();
    if (total > 0) {
      throw new ConflictException(
        'No se puede desactivar un rol con usuarios activos',
      );
    }
  }
}
