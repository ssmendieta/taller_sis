import { Controller, Get, Param, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { PermisoLogisticaGuard, PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { DisponibilidadDocumentalService } from './disponibilidad-documental.service';

@Controller('disponibilidad')
@UseGuards(PermisoLogisticaGuard)
export class DisponibilidadDocumentalController {
  constructor(private readonly service: DisponibilidadDocumentalService) {}

  @Get(':ordenCodigo')
  @SetMetadata(PERMISO_LOGISTICA, 'logistica.boletas.consultar')
  consultar(@Param('ordenCodigo') ordenCodigo: string, @Req() request: { headers: { authorization?: string } }) {
    return this.service.consultar(ordenCodigo, request.headers.authorization ?? '');
  }
}
