import {
  Controller,
  Get,
  Param,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';

import { InventarioService } from './inventario.service';
import { SesionGuard } from '../auth/sesion.guard';
import {
  PermisoProduccionGuard,
  PERMISO_PRODUCCION,
} from '../auth/permiso-produccion.guard';



@UseGuards(SesionGuard)
@Controller('inventario')
export class InventarioController {


  constructor(
    private readonly inventarioService: InventarioService,
  ) {}



  @Get('material/:id')
  @UseGuards(PermisoProduccionGuard)
  @SetMetadata(PERMISO_PRODUCCION, 'materiales.consultar_disponibilidad')
  consultarDisponibilidad(
    @Param('id') id: string,
  ) {

    return this.inventarioService.consultarDisponibilidad(
      Number(id)
    );

  }

}
