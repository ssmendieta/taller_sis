import { Controller, Get, HttpCode, Param, Post, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { IntegracionesService } from './integraciones.service';

@Controller('integraciones/eventos')
@UseGuards(PermisoProduccionGuard)
export class IntegracionesController {
  constructor(private readonly service: IntegracionesService) {}

  @Get()
  @SetMetadata(PERMISO_PRODUCCION, 'integraciones.reintentar')
  listar(@Query() query: Record<string, unknown>) {
    return this.service.listar(query);
  }

  @Post(':id/reintentar')
  @HttpCode(202)
  @SetMetadata(PERMISO_PRODUCCION, 'integraciones.reintentar')
  reintentar(@Param('id') id: string) {
    return this.service.reintentar(id);
  }
}
