import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, SetMetadata, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CreateObservacionDto } from './dto/create-observacion.dto';
import { ObservacionesService } from './observaciones.service';

// Registrar usa el permiso de ejecución de la orden; consultar, el de lectura de órdenes.
@Controller('observaciones')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ObservacionesController {
  constructor(private readonly observacionesService: ObservacionesService) {}

  @Post()
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.registrar_avance')
  registrar(
    @Body() dto: CreateObservacionDto,
    @Req() request: { usuarioId: number; usuarioNombre?: string | null },
  ) {
    return this.observacionesService.registrar(dto, request.usuarioId, request.usuarioNombre);
  }

  @Get('orden/:ordenId')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  listar(@Param('ordenId', ParseIntPipe) ordenId: number) {
    return this.observacionesService.listarPorOrden(ordenId);
  }
}
