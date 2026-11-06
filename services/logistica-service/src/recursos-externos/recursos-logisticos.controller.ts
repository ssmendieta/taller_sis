import { Controller, Get, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISO_LOGISTICA, PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { ConsultaRecursosQuery, ConsultaRecursosRespuesta } from './dto/consulta-recursos.dto';
import { ValidarConsultaRecursosPipe } from './dto/validar-consulta-recursos.pipe';
import { RecursosLogisticosService } from './recursos-logisticos.service';

// Consulta de solo lectura de Logística, como trazabilidad y disponibilidad;
// Encargado de Logística y Supervisor ya tienen este permiso.
export const PERMISO_CONSULTAR_RECURSOS = 'logistica.boletas.consultar';

@Controller('recursos-logisticos')
@UseGuards(PermisoLogisticaGuard)
export class RecursosLogisticosController {
  constructor(private readonly service: RecursosLogisticosService) {}

  // GET /recursos-logisticos?fecha=AAAA-MM-DD&disponible=true&capacidadMinima=1500&unidad=kg
  @Get()
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_CONSULTAR_RECURSOS)
  consultar(@Query(new ValidarConsultaRecursosPipe()) query: ConsultaRecursosQuery): Promise<ConsultaRecursosRespuesta> {
    return this.service.consultar(query);
  }
}
