import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { Usuario } from '../../users/entities/usuario.entity';


@Injectable()
export class AdminSeedService implements OnModuleInit {

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
  ) {}


  async onModuleInit() {

    const existeAdmin = await this.usuarioRepository.findOne({
      where: {
        correo: 'admin@sistema.com',
      },
    });


    if (existeAdmin) {
      console.log('Administrador inicial ya existe');
      return;
    }


    const passwordHash = await bcrypt.hash(
      'Admin123*',
      10,
    );


    const admin = this.usuarioRepository.create({
      nombreCompleto: 'Administrador Sistema',
      correo: 'admin@sistema.com',
      passwordHash,
      rolId: 1,
      activo: true,
    });


    await this.usuarioRepository.save(admin);


    console.log('Administrador inicial creado correctamente');
  }

}