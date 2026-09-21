import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Usuario } from './entities/usuario.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}


  // Listar usuarios
  findAll() {
    return this.usuarioRepository.find();
  }


  // Buscar usuario por ID
  findOne(id: number) {
    return this.usuarioRepository.findOne({
      where: { id }
    });
  }


  // Crear usuario
  create(dto: CreateUserDto) {

    const usuario = this.usuarioRepository.create({
      nombreCompleto: dto.nombreCompleto,
      correo: dto.correo,

      // Por ahora guardamos la contraseña recibida,
      // después aquí irá el cifrado con bcrypt
      passwordHash: dto.password,

      rolId: dto.rolId,

      activo: true,

    });

    return this.usuarioRepository.save(usuario);
  }


  // Actualizar datos del usuario
  async update(id: number, data: Partial<CreateUserDto>) {

    await this.usuarioRepository.update(
      id,
      {
        ...data,
      }
    );

    return this.findOne(id);
  }


  // Desactivar usuario (baja lógica)
  async deactivate(id: number) {

    await this.usuarioRepository.update(
      id,
      {
        activo: false,
        eliminadoEn: new Date(),
      }
    );

    return this.findOne(id);
  }


  // Activar usuario nuevamente
  async activate(id: number) {

    await this.usuarioRepository.update(
      id,
      {
        activo: true,
        eliminadoEn: null,
      }
    );

    return this.findOne(id);
  }

}