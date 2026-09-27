import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { OrdenesService } from './ordenes.service';
import { CreateOrdenDto } from './dto/create-orden.dto';

@Controller('api/produccion/ordenes')
export class OrdenesController {
  constructor(private readonly ordenesService: OrdenesService) {}

  @Post()
  create(@Body() createOrdenDto: CreateOrdenDto) {
    return this.ordenesService.create(createOrdenDto);
  }

  @Get('buscar')
  buscar(
    @Query('estado') estado?: string,
    @Query('producto') producto?: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.ordenesService.buscar(estado, producto, fecha);
  }

  @Get(':id/materiales')
  obtenerMateriales(@Param('id') id: string) {
    return this.ordenesService.obtenerMateriales(Number(id));
  }
}