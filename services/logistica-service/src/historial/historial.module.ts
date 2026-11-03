import { Module } from '@nestjs/common';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';

@Module({
  controllers: [HistorialController],
  providers: [PermisoLogisticaGuard, HistorialService],
})
export class HistorialModule {}
