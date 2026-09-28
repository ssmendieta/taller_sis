import {
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


import { OrdenesService } from './ordenes.service';
import { CreateOrdenDto } from './dto/create-orden.dto';
import { CambiarEstadoOrdenDto } from './cambiar-estado-orden.dto';

// Prefijo corto 'ordenes': el gateway reescribe /api/produccion -> '',
// un prefijo 'api/produccion/ordenes' quedaria duplicado e inaccesible.
@Controller('ordenes')
export class OrdenesController {
  constructor(private readonly ordenesService: OrdenesService) {}

  // Alta de ordenes (aporte de develop, conservado).
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

  @Get(':id/disponibilidad-materiales')
  compararDisponibilidadMateriales(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordenesService.compararDisponibilidadMateriales(id);
  }

  @Get(':id/materiales')
  obtenerMateriales(@Param('id') id: string) {
    return this.ordenesService.obtenerMateriales(Number(id));
  }



  // Historial de estados de una orden (ABC-149, lectura).
  @Get(':id/historial')
  obtenerHistorial(

    @Param('id', ParseIntPipe) id: number,

  ) {


    return this.ordenesService.obtenerHistorial(
      id,
    );


  }



  // Cambiar el estado de una orden (ABC-148).
  // TODO: proteger con el PermisosGuard de ABC-151 (permiso
  // 'ordenes.cambiar_estado') y reemplazar usuarioResponsableId del body por
  // el id del usuario autenticado cuando ese guard esté disponible.
  // ValidationPipe solo en esta ruta (no global): un pipe global con
  // whitelist rompería los endpoints existentes sin DTO decorados.
  @Patch(':id/estado')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )
  cambiarEstado(

    @Param('id', ParseIntPipe) id: number,

    @Body() dto: CambiarEstadoOrdenDto,

  ) {


    return this.ordenesService.cambiarEstado(
      id,
      dto,
    );


  }


}
