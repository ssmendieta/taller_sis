import { Module } from '@nestjs/common';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({ controllers: [ReportesController], providers: [ReportesService, PermisoProduccionGuard] })
export class ReportesModule {}
