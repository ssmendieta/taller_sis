import { Controller, Post, Body } from '@nestjs/common';
import { OrdenesService } from './ordenes.service';
import { CreateOrdenDto } from './dto/create-orden.dto';

@Controller('api/produccion/ordenes')
export class OrdenesController {
  constructor(private readonly ordenesService: OrdenesService) {}

  @Post()
  create(@Body() createOrdenDto: CreateOrdenDto) {
    return this.ordenesService.create(createOrdenDto);
  }
}