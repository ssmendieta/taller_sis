import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Rol } from '../roles/entities/role.entity';
import { AuthzModule } from '../authz/authz.module';


@Module({
  imports: [
    AuthzModule,
    TypeOrmModule.forFeature([
      Usuario,
      Rol,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secretKey',
      signOptions: {
        expiresIn: '1h',
      },
    }),
  ],
  controllers: [
    AuthController,
  ],
  providers: [
    AuthService,
  ],
  exports: [
    AuthService,
  ],
})
export class AuthModule {}
