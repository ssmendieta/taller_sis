import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Auditoria } from './entities/auditoria.entity';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaController } from './auditoria.controller';
import { AuthzModule } from '../authz/authz.module';
import { Rol } from '../roles/entities/role.entity';

// fix(bloqueante): PermisosGuard (usado por AuditoriaController) inyecta
// RolRepository; sin forFeature([Rol]) Nest no puede instanciarlo al arrancar.
@Module({
  imports: [TypeOrmModule.forFeature([Auditoria, Rol]), AuthzModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
