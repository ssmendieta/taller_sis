import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { RolesModule } from './roles/roles.module';
import { PermisosModule } from './permisos/permisos.module';

@Module({
  imports: [DatabaseModule, HealthModule, UsersModule, AuditoriaModule, RolesModule, PermisosModule],
  controllers: [AppController],
})
export class AppModule {}
