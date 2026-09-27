
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(private readonly dataSource: DataSource) {}

  async login(correo: string, password: string) {
    const usuario = await this.dataSource.getRepository(UserEntity).findOne({
      where: { correo },
    });

    if (!usuario || !usuario.activo || usuario.eliminadoEn) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    const passwordValida = await bcrypt.compare(
      password,
      usuario.passwordHash,
    );

    if (!passwordValida) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    return {
      message: 'Inicio de sesión exitoso',
      usuario: {
        id: usuario.id,
        nombreCompleto: usuario.nombreCompleto,
        correo: usuario.correo,
        rolId: usuario.rolId,
      },
    };
  }
}
