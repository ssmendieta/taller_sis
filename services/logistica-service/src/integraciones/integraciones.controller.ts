import { Controller, Get, HttpCode, Param, Post, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISO_LOGISTICA, PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { IntegracionesLogisticaService } from './integraciones.service';

// ABC-388: mismo permiso que el panel de integraciones de Producción.
export const PERMISO_INTEGRACIONES = 'integraciones.reintentar';

@Controller('integraciones/eventos')
@UseGuards(PermisoLogisticaGuard)
export class IntegracionesLogisticaController {
  constructor(private readonly service: IntegracionesLogisticaService) {}

  @Get()
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_INTEGRACIONES)
  listar(@Query() query: Record<string, unknown>) {
    return this.service.listar(query);
  }

  @Post(':id/reintentar')
  @HttpCode(202)
  @SetMetadata(PERMISO_LOGISTICA, PERMISO_INTEGRACIONES)
  reintentar(@Param('id') id: string) {
    return this.service.reintentar(id);
  }
}
