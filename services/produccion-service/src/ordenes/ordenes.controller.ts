import { 
  Controller, 
  Get, 
  Param, 
  Query,
  Put,
  Body,
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
 
 
 
  // Obtener detalle de una orden
  @Get(':id')
  obtenerDetalle( 
 
    @Param('id') id: string, 
 
  ) { 
 
    return this.ordenesService.obtenerDetalle( 
      Number(id),
    ); 
 
  } 
 
 
 
  // Obtener historial de estados
  @Get(':id/historial')
  obtenerHistorial( 
 
    @Param('id') id: string, 
 
  ) { 
 
    return this.ordenesService.obtenerHistorial( 
      Number(id),
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



  // Finalizar orden
  @Put(':id/finalizar')
  finalizar(
    
    @Param('id') id: string,

  ) {

    return this.ordenesService.finalizar(
      Number(id),
    );

  }



  // Cancelar orden
  @Put(':id/cancelar')
  cancelar(

    @Param('id') id: string,

    @Body() data: any,

  ) {

    return this.ordenesService.cancelar(
      Number(id),
      data.motivo,
    );

  }
 
 
}