import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RecetasService } from './recetas.service';
import { CreateRecetaDto } from './dto/create-receta.dto';
import { UpdateRecetaDto } from './dto/update-receta.dto';

@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@Controller('recetas')
export class RecetasController {
  constructor(private readonly recetasService: RecetasService) {}

  @Post()
  create(@Body() dto: CreateRecetaDto) {
    return this.recetasService.create(dto);
  }

  @Get()
  findAll(@Query('activa') activa?: string) {
    if (activa === undefined) {
      return this.recetasService.findAll();
    }

    if (activa === 'true') {
      return this.recetasService.findAll(true);
    }

    if (activa === 'false') {
      return this.recetasService.findAll(false);
    }

    throw new BadRequestException(
      `Query param 'activa' inválido: use 'true' o 'false'`,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recetasService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecetaDto,
  ) {
    return this.recetasService.update(id, dto);
  }

  @Patch(':id/desactivar')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.recetasService.desactivar(id);
  }
}
