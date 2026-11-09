import { Controller, Get, Header, Param, ParseEnumPipe, Query, Req, SetMetadata, StreamableFile, UseGuards } from '@nestjs/common';
import { PERMISO_LOGISTICA, PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { PERMISO_CONSULTAR_RUTAS } from '../rutas/rutas.controller';
import { ReporteLogistico, ReporteLogisticoQuery } from './dto/reporte-logistico.dto';
import { ValidarReporteLogisticoPipe } from './dto/validar-reporte-logistico.pipe';
import { ReportesService } from './reportes.service';
import { datosExportacion } from './exportadores/datos-exportacion';
import { generarExcel } from './exportadores/excel.exportador';
import { generarPdf } from './exportadores/pdf.exportador';

enum FormatoReporteLogistico {
  PDF = 'pdf',
  EXCEL = 'xlsx',
}

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

  @Get('logistica/exportar/:formato')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RUTAS)
  @Header('Cache-Control', 'no-store')
  async exportar(
    @Param('formato', new ParseEnumPipe(FormatoReporteLogistico)) formato: FormatoReporteLogistico,
    @Query(new ValidarReporteLogisticoPipe()) filtros: ReporteLogisticoQuery,
    @Req() request: { headers?: { authorization?: string } },
  ): Promise<StreamableFile> {
    const reporte = await this.service.generar(filtros, request.headers?.authorization ?? '');
    const secciones = datosExportacion(reporte);
    const esPdf = formato === FormatoReporteLogistico.PDF;
    const archivo = await (esPdf ? generarPdf(secciones, reporte.generadoEn) : generarExcel(secciones, reporte.generadoEn));
    const nombre = `reporte-logistico_${filtros.fechaDesde}_a_${filtros.fechaHasta}.${formato}`;
    return new StreamableFile(archivo, {
      type: esPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${nombre}"`, length: archivo.length,
    });
  }
}
