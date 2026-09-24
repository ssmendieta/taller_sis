import { Injectable, BadRequestException } from '@nestjs/common';
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



  // Crear usuario con validaciones y bcrypt
  async create(dto: CreateUserDto) {


    // Verificar si el correo ya existe
    const usuarioExistente =
      await this.usuarioRepository.findOne({
        where: {
          correo: dto.correo,
        },
      });



    if (usuarioExistente) {

      throw new BadRequestException(
        'El correo ya está registrado'
      );

    }



    // Si no envían contraseña, se asigna una inicial
    const passwordInicial =
      dto.password || 'Cambio123*';



    // Cifrar contraseña antes de guardar
    const passwordHash =
      await bcrypt.hash(
        passwordInicial,
        10
      );



    const usuario =
      this.usuarioRepository.create({

        nombreCompleto:
          dto.nombreCompleto,

        correo:
          dto.correo,

        // Solo guardamos el hash
        passwordHash,

        rolId:
          dto.rolId,

        activo: true,

      });



    const usuarioGuardado =
      await this.usuarioRepository.save(usuario);



    // Retornamos contraseña inicial solo al crear
    return {

      usuario: usuarioGuardado,

      passwordInicial,

    };

  }





  // Actualizar datos del usuario
  async update(
    id: number,
    data: Partial<CreateUserDto>
  ) {



    // Si cambia correo, verificar duplicado
    if (data.correo) {


      const usuarioExistente =
        await this.usuarioRepository.findOne({
          where: {
            correo: data.correo,
          },
        });



      if (
        usuarioExistente &&
        usuarioExistente.id !== id
      ) {

        throw new BadRequestException(
          'El correo ya está registrado'
        );

      }

    }




    // Si cambian contraseña, volver a cifrar
    if (data.password) {


      data.password =
        await bcrypt.hash(
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