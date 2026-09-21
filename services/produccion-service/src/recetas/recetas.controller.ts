import { Controller, Get, Post, Body } from '@nestjs/common';
import { RecetasService } from './recetas.service';
import { CreateRecetaDto } from './dto/create-receta.dto';

@Controller('recetas')
export class RecetasController {

  constructor(
    private readonly recetasService: RecetasService
  ) {}

  @Get()
  findAll() {
    return this.recetasService.findAll();
  }

  @Post()
  create(
    @Body() data: CreateRecetaDto
  ) {
    return this.recetasService.create(data);
  }
}