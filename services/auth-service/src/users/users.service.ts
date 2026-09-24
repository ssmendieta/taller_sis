import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Usuario } from './entities/usuario.entity';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

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


  // Crear usuario con contraseña inicial y bcrypt
  async create(dto: CreateUserDto) {

    // Si no envían contraseña, se asigna una inicial
    const passwordInicial = dto.password || 'Cambio123*';


    // Cifrar contraseña antes de guardar
    const passwordHash = await bcrypt.hash(
      passwordInicial,
      10
    );


    const usuario = this.usuarioRepository.create({

      nombreCompleto: dto.nombreCompleto,

      correo: dto.correo,

      // Se guarda únicamente el hash
      passwordHash,

      rolId: dto.rolId,

      activo: true,

    });


    const usuarioGuardado = await this.usuarioRepository.save(usuario);


    // Retornamos la contraseña inicial solo al crear
    return {
      usuario: usuarioGuardado,
      passwordInicial,
    };
  }



  // Actualizar datos del usuario
  async update(id: number, data: Partial<CreateUserDto>) {


    // Si cambian contraseña, se vuelve a cifrar
    if (data.password) {

      data.password = await bcrypt.hash(
        data.password,
        10
      );

    }


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