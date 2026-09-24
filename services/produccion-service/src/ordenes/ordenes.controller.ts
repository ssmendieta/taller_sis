import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';


import { OrdenesService } from './ordenes.service';



@Controller('ordenes')
export class OrdenesController {


  constructor(
    private readonly ordenesService: OrdenesService,
  ) {}



  // Buscar órdenes con filtros
  @Get('buscar')
  buscar(

    @Query('estado') estado?: string,

    @Query('producto') producto?: string,

    @Query('fecha') fecha?: string,

  ) {


    return this.ordenesService.buscar(
      estado,
      producto,
      fecha,
    );


  }





  // Mostrar materiales requeridos de una orden
  @Get(':id/materiales')
  obtenerMateriales(

    @Param('id') id: string,

  ) {


    return this.ordenesService.obtenerMateriales(
      Number(id),
    );


  }


}