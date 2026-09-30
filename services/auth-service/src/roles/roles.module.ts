import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rol } from './entities/role.entity';
import { Permisos } from '../permisos/entities/permiso.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { AuthzModule } from '../authz/authz.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rol, Permisos, Usuario]),
    AuthzModule,
    AuditoriaModule,
  ],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
