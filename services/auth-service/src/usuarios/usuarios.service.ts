import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Usuario } from './entities/usuario.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}

  async create(createUsuarioDto: CreateUsuarioDto): Promise<Usuario> {
    const correo = createUsuarioDto.correo.trim().toLowerCase();
    const existeCorreo = await this.usuarioRepository.findOne({ where: { correo } });
    if (existeCorreo) throw new ConflictException('El correo ya está registrado');

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(createUsuarioDto.password, salt);

    const nuevoUsuario = this.usuarioRepository.create({
      nombre_completo: createUsuarioDto.nombre_completo,
      correo,
      rol_id: createUsuarioDto.rol_id,
      password_hash,
    });

    try {
      return await this.usuarioRepository.save(nuevoUsuario);
    } catch (error) {
      if (this.esViolacionUnicidad(error)) throw new ConflictException('El correo ya está registrado');
      throw error;
    }
  }

  async findAll(): Promise<Usuario[]> {
    return await this.usuarioRepository.find({ where: { eliminado_en: IsNull() } });
  }

  async findOne(id: number): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne({ where: { id, eliminado_en: IsNull() } });
    if (!usuario) throw new NotFoundException(`Usuario no encontrado`);
    return usuario;
  }

  async update(id: number, updateUsuarioDto: UpdateUsuarioDto): Promise<Usuario> {
    const usuario = await this.findOne(id);

    if (updateUsuarioDto.password) {
      const salt = await bcrypt.genSalt(10);
      usuario.password_hash = await bcrypt.hash(updateUsuarioDto.password, salt);
      delete updateUsuarioDto.password;
    }

    if (updateUsuarioDto.correo) {
      const correo = updateUsuarioDto.correo.trim().toLowerCase();
      const existente = await this.usuarioRepository.findOne({ where: { correo } });
      if (existente && existente.id !== id) throw new ConflictException('El correo ya está registrado');
      updateUsuarioDto.correo = correo;
    }

    Object.assign(usuario, updateUsuarioDto);
    try {
      return await this.usuarioRepository.save(usuario);
    } catch (error) {
      if (this.esViolacionUnicidad(error)) throw new ConflictException('El correo ya está registrado');
      throw error;
    }
  }

  async changeStatus(id: number, activo: boolean): Promise<Usuario> {
    const usuario = await this.findOne(id);
    usuario.activo = activo;
    return await this.usuarioRepository.save(usuario);
  }

  async softDelete(id: number): Promise<void> {
    const usuario = await this.findOne(id);
    usuario.eliminado_en = new Date();
    usuario.activo = false;
    await this.usuarioRepository.save(usuario);
  }

  private esViolacionUnicidad(error: unknown): boolean {
    const e = error as { code?: string; driverError?: { code?: string } };
    return e?.code === '23505' || e?.driverError?.code === '23505';
  }
}