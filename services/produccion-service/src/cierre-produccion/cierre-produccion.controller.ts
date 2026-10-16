import { Body, Controller, Get, Param, Post, Query, SetMetadata, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CierreProduccionService } from './cierre-produccion.service';
import { PrepararCierreDto } from './dto/preparar-cierre.dto';
import { ConsultarCierreParamsDto, ConsultarCierreQueryDto } from './dto/consultar-cierre.dto';

@Controller('cierres-produccion')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CierreProduccionController {
  constructor(private readonly service: CierreProduccionService) {}

  @Post()
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.finalizar_cancelar')
  preparar(@Body() dto: PrepararCierreDto) {
    return this.service.preparar(dto);
  }

  @Get('orden/:ordenId')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  consultar(@Param() params: ConsultarCierreParamsDto, @Query() query: ConsultarCierreQueryDto) {
    return this.service.consultar(params.ordenId, query.cierreVersion);
  }
}
