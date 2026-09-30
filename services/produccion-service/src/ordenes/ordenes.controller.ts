import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';


import { OrdenesService, UsuarioAutenticadoProduccion } from './ordenes.service';
import { CreateOrdenDto } from './dto/create-orden.dto';
import { CambiarEstadoOrdenDto } from './cambiar-estado-orden.dto';
import { PermisoProduccionGuard, PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';

// Prefijo corto 'ordenes': el gateway reescribe /api/produccion -> '',
// un prefijo 'api/produccion/ordenes' quedaria duplicado e inaccesible.
@Controller('ordenes')
export class OrdenesController {
  constructor(private readonly ordenesService: OrdenesService) {}

  // Alta de ordenes (aporte de develop, conservado).
  @Post()
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.crear')
  create(@Body() createOrdenDto: CreateOrdenDto) {
    return this.ordenesService.create(createOrdenDto);
  }

  @Get()
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  findAll() {
    return this.ordenesService.findAll();
  }

  @Get('buscar')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  buscar(
    @Query('estado') estado?: string,
    @Query('producto') producto?: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.ordenesService.buscar(estado, producto, fecha);
  }

  @Get('codigo/:codigo')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  findByCodigo(@Param('codigo') codigo: string) {
    return this.ordenesService.findByCodigo(codigo);
  }

  // Detalle de una orden (ABC-187, aporte de ramagemina).
  // Debe declararse despues de rutas literales como 'buscar'.
  @Get(':id')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerDetalle(@Param('id', ParseIntPipe) id: number) {
    return this.ordenesService.obtenerDetalle(id);
  }

  @Get(':id/disponibilidad-materiales')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  compararDisponibilidadMateriales(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ordenesService.compararDisponibilidadMateriales(id);
  }

  @Get(':id/materiales')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerMateriales(@Param('id') id: string) {
    return this.ordenesService.obtenerMateriales(Number(id));
  }



  // Historial de estados de una orden (ABC-149, lectura).
  @Get(':id/historial')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.consultar')
  obtenerHistorial(

    @Param('id', ParseIntPipe) id: number,

  ) {


    return this.ordenesService.obtenerHistorial(
      id,
    );


  }



  // Cambiar el estado de una orden (ABC-148).
  // El guard obtiene del servicio Auth al actor y sus permisos actuales.
  @Patch(':id/estado')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'ordenes.cambiar_estado')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )
  cambiarEstado(

    @Param('id', ParseIntPipe) id: number,

    @Body() dto: CambiarEstadoOrdenDto,
    @Req() request: { usuarioId: number; usuarioAutenticado: UsuarioAutenticadoProduccion },

  ) {


    return this.ordenesService.cambiarEstado(
      id,
      { ...dto, usuarioResponsableId: request.usuarioId },
      request.usuarioAutenticado,
    );


  }


}
