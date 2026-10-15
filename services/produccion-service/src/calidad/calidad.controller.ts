import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, SetMetadata, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CalidadService } from './calidad.service';
import { CreateResultadoConformeDto } from './dto/create-resultado-conforme.dto';
import { ConsultarResultadosQueryDto } from './dto/consultar-resultados-query.dto';

@Controller('calidad/conformes')
@UseGuards(PermisoProduccionGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class CalidadController {
  constructor(private readonly calidadService: CalidadService) {}

  @Post()
  @SetMetadata(PERMISO_PRODUCCION, 'calidad.registrar_conformes')
  registrar(@Body() dto: CreateResultadoConformeDto, @Req() request: { usuarioId: number }) {
    return this.calidadService.registrarResultado(dto, request.usuarioId);
  }

  @Get('orden/:ordenId')
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  consultar(@Param('ordenId', ParseIntPipe) ordenId: number, @Query() query: ConsultarResultadosQueryDto) {
    return this.calidadService.consultarResultados(ordenId, query.tipo);
  }
}
