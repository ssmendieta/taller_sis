import { Controller, Get, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { PermisoProduccionGuard, PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';
import { ReporteProduccionQueryDto } from './dto/reporte-produccion.dto';
import { ValidarReporteProduccionPipe } from './dto/validar-reporte-produccion.pipe';
import { ReportesService } from './reportes.service';

@Controller('reportes')
@UseGuards(PermisoProduccionGuard)
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  @Get('produccion')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  produccion(@Query(new ValidarReporteProduccionPipe()) query: ReporteProduccionQueryDto) {
    return this.service.produccion(query);
  }
}
