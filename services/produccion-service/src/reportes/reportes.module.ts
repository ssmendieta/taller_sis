import { Module } from '@nestjs/common';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { ExcelExportador } from './exportadores/excel.exportador';
import { PdfExportador } from './exportadores/pdf.exportador';
import { ExportacionReportesService } from './exportacion-reportes.service';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  controllers: [ReportesController],
  providers: [ReportesService, ExportacionReportesService, PdfExportador, ExcelExportador, PermisoProduccionGuard],
})
export class ReportesModule {}
