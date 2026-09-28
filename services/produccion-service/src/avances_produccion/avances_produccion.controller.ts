import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, SetMetadata, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AvancesProduccionService } from './avances_produccion.service';
import { CreateAvancesProduccionDto } from './dto/create-avances_produccion.dto';
import { PermisoProduccionGuard, PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';

@Controller('avances-produccion')
export class AvancesProduccionController {
  constructor(private readonly avancesProduccionService: AvancesProduccionService) {}

  @Post()
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.registrar_avance')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  create(@Body() dto: CreateAvancesProduccionDto, @Req() request: { usuarioId: number }) {
    return this.avancesProduccionService.create({
      ...dto,
      usuario_responsable_id: request.usuarioId,
    });
  }

  @Get()
  findAll() {
    return this.avancesProduccionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.avancesProduccionService.findOne(id);
  }
}
