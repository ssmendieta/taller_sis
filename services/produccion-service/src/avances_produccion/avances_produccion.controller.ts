import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AvancesProduccionService } from './avances_produccion.service';
import { CreateAvancesProduccionDto } from './dto/create-avances_produccion.dto';
import { UpdateAvancesProduccionDto } from './dto/update-avances_produccion.dto';

@Controller('avances-produccion')
export class AvancesProduccionController {
  constructor(private readonly avancesProduccionService: AvancesProduccionService) {}

  @Post()
  create(@Body() createAvancesProduccionDto: CreateAvancesProduccionDto) {
    return this.avancesProduccionService.create(createAvancesProduccionDto);
  }

  @Get()
  findAll() {
    return this.avancesProduccionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.avancesProduccionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAvancesProduccionDto: UpdateAvancesProduccionDto) {
    return this.avancesProduccionService.update(+id, updateAvancesProduccionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.avancesProduccionService.remove(+id);
  }
}
