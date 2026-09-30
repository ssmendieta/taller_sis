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
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RecetasService } from './recetas.service';
import { RecetasVersionService } from './recetas-version.service';
import { CreateRecetaDto } from './dto/create-receta.dto';
import { UpdateRecetaDto } from './dto/update-receta.dto';
import { CrearVersionRecetaDto } from './dto/crear-version-receta.dto';
import {
  PermisoProduccionGuard,
  PERMISO_PRODUCCION,
} from '../auth/permiso-produccion.guard';
import { SesionGuard } from '../auth/sesion.guard';

@UseGuards(SesionGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@Controller('recetas')
export class RecetasController {
  constructor(
    private readonly recetasService: RecetasService,
    private readonly recetasVersionService: RecetasVersionService,
  ) {}

  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  @Post()
  create(@Body() dto: CreateRecetaDto) {
    return this.recetasService.create(dto);
  }

  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
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

  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  @Get(':id/versiones')
  listarVersiones(@Param('id', ParseIntPipe) id: number) {
    return this.recetasService.listarVersiones(id);
  }

  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recetasService.findOne(id);
  }

  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecetaDto,
  ) {
    return this.recetasService.update(id, dto);
  }

  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  @Patch(':id/desactivar')
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.recetasService.desactivar(id);
  }

  // ABC-137: crea una versión nueva de la receta sin borrar la anterior
  // (desactiva la versión actual y da de alta la nueva con sus materiales).
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'recetas.gestionar')
  @Post(':id/versiones')
  crearVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearVersionRecetaDto,
  ) {
    return this.recetasVersionService.crearNuevaVersion(
      id,
      dto.producto_nombre,
      dto.materiales.map((material) => ({
        materialId: material.material_id,
        cantidadRequerida: material.cantidad_requerida,
      })),
      dto.unidad_producto,
    );
  }
}
