import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permisos} from './entities/permiso.entity';
import { PermisosService } from './permisos.service';
import { PermisosController } from './permisos.controller';
import { AuthzModule } from '../authz/authz.module';
import { Rol } from '../roles/entities/role.entity';

// fix(bloqueante): PermisosGuard (usado por PermisosController) inyecta
// RolRepository; sin forFeature([Rol]) Nest no puede instanciarlo al arrancar.
@Module({
  imports: [TypeOrmModule.forFeature([Permisos, Rol]), AuthzModule],
  controllers: [PermisosController],
  providers: [PermisosService],
})
export class PermisosModule {}
