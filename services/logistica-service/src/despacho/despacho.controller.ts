import { Body, Controller, Param, Post, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { PERMISO_GESTIONAR_RUTAS } from '../rutas/rutas.controller';
import { RegistrarObservacionDto, ValidarObservacionPipe } from './dto/validar-observacion.pipe';
import { DespachoService } from './despacho.service';

// ABC-376: despacho y entrega. El autor es el usuario de la sesión.
@Controller('rutas')
@UseGuards(PermisoLogisticaGuard)
export class DespachoController {
  constructor(private readonly service: DespachoService) {}

  @Post(':id/despacho')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_GESTIONAR_RUTAS)
  despachar(
    @Param('id') id: string,
    @Body(new ValidarObservacionPipe()) dto: RegistrarObservacionDto,
    @Req() request: { usuarioId: string },
  ) {
    return this.service.despachar(id, request.usuarioId, dto.observacion);
  }

  @Post(':id/paradas/:paradaId/entrega')
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_GESTIONAR_RUTAS)
  entregar(
    @Param('id') id: string,
    @Param('paradaId') paradaId: string,
    @Body(new ValidarObservacionPipe()) dto: RegistrarObservacionDto,
    @Req() request: { usuarioId: string },
  ) {
    return this.service.entregar(id, paradaId, request.usuarioId, dto.observacion);
  }
}
