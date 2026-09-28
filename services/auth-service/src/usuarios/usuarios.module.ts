import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';
import { Usuario } from './entities/usuario.entity';
import { Rol } from '../roles/entities/role.entity';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthzModule } from '../authz/authz.module';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario, Rol]), AuditoriaModule, AuthzModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
