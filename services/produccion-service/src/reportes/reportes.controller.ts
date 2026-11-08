import { Controller, Get, Param, ParseEnumPipe, Query, Res, SetMetadata, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PermisoProduccionGuard, PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';
import { ReporteProduccionQueryDto } from './dto/reporte-produccion.dto';
import { ValidarReporteProduccionPipe } from './dto/validar-reporte-produccion.pipe';
import { ExportacionReportesService, FormatoExportacion } from './exportacion-reportes.service';
import { ReportesService } from './reportes.service';

@Controller('reportes')
@UseGuards(PermisoProduccionGuard)
export class ReportesController {
  constructor(private readonly service: ReportesService, private readonly exportacion: ExportacionReportesService) {}

  @Get('produccion')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  produccion(@Query(new ValidarReporteProduccionPipe()) query: ReporteProduccionQueryDto) {
    return this.service.produccion(query);
  }

  @Get('produccion/exportar/:formato')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  async exportar(
    @Param('formato', new ParseEnumPipe(FormatoExportacion)) formato: FormatoExportacion,
    @Query(new ValidarReporteProduccionPipe()) query: ReporteProduccionQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const archivo = await this.exportacion.exportar(query, formato);
    response.set({
      'Content-Type': archivo.mime,
      'Content-Disposition': `attachment; filename="${archivo.nombre}"`,
      'Content-Length': archivo.contenido.length,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(archivo.contenido);
  }
}
