import { Controller, Get, Param, ParseIntPipe, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { PermisoProduccionGuard, PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';
import { ListarHistorialOrdenesDto } from './dto/listar-historial-ordenes.dto';
import { ValidarListarHistorialOrdenesPipe } from './dto/validar-listar-historial-ordenes.pipe';
import { HistorialService } from './historial.service';

// El gateway elimina /api/produccion antes de reenviar la solicitud.
@Controller('historial')
@UseGuards(PermisoProduccionGuard)
export class HistorialController {
  constructor(private readonly service: HistorialService) {}

  @Get('ordenes')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  listarOrdenes(@Query(new ValidarListarHistorialOrdenesPipe()) query: ListarHistorialOrdenesDto) {
    return this.service.listarOrdenes(query);
  }

  @Get('ordenes/:ordenId/eventos')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  detalleOrden(@Param('ordenId', ParseIntPipe) ordenId: number) {
    return this.service.detalleOrden(ordenId);
  }
}
