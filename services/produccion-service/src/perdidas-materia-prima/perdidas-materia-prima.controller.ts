import { Body, Controller, Get, Param, Post, Req, SetMetadata, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CrearPerdidaMateriaPrimaDto, OrdenPerdidasParamsDto } from './dto/crear-perdida-materia-prima.dto';
import { PerdidasMateriaPrimaService } from './perdidas-materia-prima.service';

@Controller('perdidas-materia-prima')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class PerdidasMateriaPrimaController {
  constructor(private readonly perdidasService: PerdidasMateriaPrimaService) {}

  // Registrar mermas usa el permiso existente de registro de consumos de material.
  @Post()
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.registrar_consumo')
  create(@Body() dto: CrearPerdidaMateriaPrimaDto, @Req() request: { usuarioId: number }) {
    return this.perdidasService.create(dto, request.usuarioId);
  }

  @Get('orden/:ordenId')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  findByOrden(@Param() params: OrdenPerdidasParamsDto) {
    return this.perdidasService.findByOrden(params.ordenId);
  }
}
