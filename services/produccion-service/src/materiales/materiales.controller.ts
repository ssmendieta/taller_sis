import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';


import { MaterialesService } from './materiales.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { SesionGuard } from '../auth/sesion.guard';



@UseGuards(SesionGuard)
@Controller('materiales')
export class MaterialesController {


  constructor(
    private readonly materialesService: MaterialesService,
  ) {}



  @Get()
  findAll() {
    return this.materialesService.findAll();
  }



  @Get(':id')
  findOne(
    @Param('id') id: string,
  ) {
    return this.materialesService.findOne(Number(id));
  }



  @Post()
  create(
    @Body() dto: CreateMaterialDto,
  ) {
    return this.materialesService.create(dto);
  }



  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: UpdateMaterialDto,
  ) {
    return this.materialesService.update(Number(id), data);
  }



  @Delete(':id')
  remove(
    @Param('id') id: string,
  ) {
    return this.materialesService.remove(Number(id));
  }

}