import { Module } from '@nestjs/common';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

// ABC-110: reportes logísticos. ABC-340 expone los datos; la vista previa y los
// archivos PDF/Excel los reutilizan con los mismos filtros.
@Module({
  controllers: [ReportesController],
  providers: [PermisoLogisticaGuard, ReportesService, LotesProduccionClient],
  exports: [ReportesService],
})
export class ReportesModule {}
