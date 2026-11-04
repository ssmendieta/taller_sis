import { Body, Controller, Get, Param, Post, Query, Req, SetMetadata, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CreateConsumoMaterialDto } from './dto/create-consumo-material.dto';
import { ConsultarConsumosQueryDto, OrdenConsumosParamsDto } from './dto/consultar-consumos.dto';
import { ConsumosMaterialService } from './consumos-material.service';

@Controller('consumos-material')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class ConsumosMaterialController {
  constructor(private readonly consumosService: ConsumosMaterialService) {}

  @Post()
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.registrar_consumo')
  create(@Body() dto: CreateConsumoMaterialDto, @Req() request: { usuarioId: number }) {
    return this.consumosService.create(dto, request.usuarioId);
  }

  @Get('orden/:ordenId')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  findByOrden(@Param() params: OrdenConsumosParamsDto, @Query() query: ConsultarConsumosQueryDto) {
    return this.consumosService.findByOrden(params.ordenId, query.materialId);
  }

  @Get('orden/:ordenId/totales')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  totales(@Param() params: OrdenConsumosParamsDto, @Query() query: ConsultarConsumosQueryDto) {
    return this.consumosService.totales(params.ordenId, query.materialId);
  }
}
