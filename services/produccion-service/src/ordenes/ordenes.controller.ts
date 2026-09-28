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


import { OrdenesService } from './ordenes.service';
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

  @Get('buscar')
  buscar(
    @Query('estado') estado?: string,
    @Query('producto') producto?: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.ordenesService.buscar(estado, producto, fecha);
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
    @Req() request: { usuarioId: number },

  ) {


    return this.ordenesService.cambiarEstado(
      id,
      { ...dto, usuarioResponsableId: request.usuarioId },
    );


  }


}
