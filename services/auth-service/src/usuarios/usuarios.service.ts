import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Rol } from '../roles/entities/role.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { Usuario } from './entities/usuario.entity';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Rol)
    private readonly roles: Repository<Rol>,
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
    // La migración define un índice único sobre LOWER(correo).
    if ((error as { driverError?: { constraint?: string } })?.driverError?.constraint === 'ux_usuarios_correo_ci') {
      throw new ConflictException('El correo ya está registrado');
    }
    throw error;
  }

  async create(dto: CreateUsuarioDto): Promise<Usuario> {
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
      return this.findOne(guardado.id); // Nunca responder con password_hash.
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

  async update(id: string, dto: UpdateUsuarioDto): Promise<Usuario> {
    const usuario = await this.findOne(id);
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
      return this.findOne(id);
    } catch (error) {
      this.verificarCorreoDuplicado(error);
    }
  }

  async changeStatus(id: string, activo: boolean): Promise<Usuario> {
    if (typeof activo !== 'boolean') throw new BadRequestException('activo debe ser booleano');
    const usuario = await this.findOne(id);
    usuario.activo = activo;
    await this.usuarios.save(usuario);
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<void> {
    const usuario = await this.findOne(id);
    usuario.eliminado_en = new Date();
    usuario.activo = false;
    await this.usuarios.save(usuario);
  }
}
