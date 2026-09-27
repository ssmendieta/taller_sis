import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { RolesModule } from './roles/roles.module';
import { PermisosModule } from './permisos/permisos.module';

@Module({
  imports: [DatabaseModule, HealthModule, UsuariosModule, AuditoriaModule, RolesModule, PermisosModule],
  controllers: [AppController],
})
export class AppModule {}
