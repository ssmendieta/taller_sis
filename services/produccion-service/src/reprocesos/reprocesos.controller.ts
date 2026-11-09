import {
  Body, Controller, Get, Param, ParseIntPipe, Post,
  Req, SetMetadata, UseGuards, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { RegistrarReprocesoDto } from './dto/registrar-reproceso.dto';
import { ReprocesosService } from './reprocesos.service';

@Controller('ordenes/:ordenId/reprocesos')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ReprocesosController {
  constructor(private readonly reprocesos: ReprocesosService) {}

  @Post()
  @SetMetadata(PERMISO_PRODUCCION, 'calidad.registrar_conformes')
  registrar(
    @Param('ordenId', ParseIntPipe) ordenId: number,
    @Body() dto: RegistrarReprocesoDto,
    @Req() request: { usuarioId: number },
  ) {
    return this.reprocesos.registrar(ordenId, dto, request.usuarioId);
  }

  @Get()
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  consultar(@Param('ordenId', ParseIntPipe) ordenId: number) {
    return this.reprocesos.consultar(ordenId);
  }
}
