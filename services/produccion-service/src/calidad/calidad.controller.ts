import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import {
  PERMISO_PRODUCCION,
  PermisoProduccionGuard,
} from '../auth/permiso-produccion.guard';
import {
  CalidadService,
  PERMISO_CONSULTAR_CONFORMES,
} from './calidad.service';

@Controller('calidad')
export class CalidadController {
  constructor(private readonly calidadService: CalidadService) {}

  @Get('ordenes/:ordenId/conformes')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, PERMISO_CONSULTAR_CONFORMES)
  consultarConformes(@Param('ordenId', ParseIntPipe) ordenId: number) {
    return this.calidadService.consultarConformes(ordenId);
  }
}
