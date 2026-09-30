import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';


import { MaterialesService } from './materiales.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { SesionGuard } from '../auth/sesion.guard';
import {
  PermisoProduccionGuard,
  PERMISO_PRODUCCION,
} from '../auth/permiso-produccion.guard';



@UseGuards(SesionGuard)
@Controller('materiales')
export class MaterialesController {


  constructor(
    private readonly materialesService: MaterialesService,
  ) {}



  @Get()
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.consultar_disponibilidad')
  findAll() {
    return this.materialesService.findAll();
  }



  @Get(':id')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.consultar_disponibilidad')
  findOne(
    @Param('id') id: string,
  ) {
    return this.materialesService.findOne(Number(id));
  }



  @Post()
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  create(
    @Body() dto: CreateMaterialDto,
  ) {
    return this.materialesService.create(dto);
  }



  @Put(':id')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  update(
    @Param('id') id: string,
    @Body() data: UpdateMaterialDto,
  ) {
    return this.materialesService.update(Number(id), data);
  }



  @Delete(':id')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  remove(
    @Param('id') id: string,
  ) {
    return this.materialesService.remove(Number(id));
  }

}
