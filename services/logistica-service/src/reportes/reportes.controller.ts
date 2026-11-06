import { Controller, Get, Query, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISO_LOGISTICA, PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { PERMISO_CONSULTAR_RUTAS } from '../rutas/rutas.controller';
import { ReporteLogistico, ReporteLogisticoQuery } from './dto/reporte-logistico.dto';
import { ValidarReporteLogisticoPipe } from './dto/validar-reporte-logistico.pipe';
import { ReportesService } from './reportes.service';

// ABC-340: mismo permiso de consulta que el historial y el dashboard de Logística
// (Encargado de Logística y Supervisor).
@Controller('reportes')
@UseGuards(PermisoLogisticaGuard)
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  // GET /reportes/logistica?fechaDesde=AAAA-MM-DD&fechaHasta=AAAA-MM-DD&estadoRuta=&estadoBoleta=
  @Get('logistica')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  consultar(
    @Query(new ValidarReporteLogisticoPipe()) filtros: ReporteLogisticoQuery,
    @Req() request: { headers?: { authorization?: string } },
  ): Promise<ReporteLogistico> {
    // La sesión se reenvía a Producción solo para conocer las unidades.
    return this.service.generar(filtros, request.headers?.authorization ?? '');
  }
}
