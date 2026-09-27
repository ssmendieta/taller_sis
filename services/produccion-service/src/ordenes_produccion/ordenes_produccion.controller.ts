import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OrdenesProduccionService } from './ordenes_produccion.service';
import { CreateOrdenesProduccionDto } from './dto/create-ordenes_produccion.dto';
import { UpdateOrdenesProduccionDto } from './dto/update-ordenes_produccion.dto';

@Controller('ordenes-produccion')
export class OrdenesProduccionController {
  constructor(private readonly ordenesProduccionService: OrdenesProduccionService) {}

  @Post()
  create(@Body() createOrdenesProduccionDto: CreateOrdenesProduccionDto) {
    return this.ordenesProduccionService.create(createOrdenesProduccionDto);
  }

  @Get()
  findAll() {
    return this.ordenesProduccionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordenesProduccionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrdenesProduccionDto: UpdateOrdenesProduccionDto) {
    return this.ordenesProduccionService.update(+id, updateOrdenesProduccionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ordenesProduccionService.remove(+id);
  }
}
