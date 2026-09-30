import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';

import { InventarioService } from './inventario.service';
import { SesionGuard } from '../auth/sesion.guard';



@UseGuards(SesionGuard)
@Controller('inventario')
export class InventarioController {


  constructor(
    private readonly inventarioService: InventarioService,
  ) {}



  @Get('material/:id')
  consultarDisponibilidad(
    @Param('id') id: string,
  ) {

    return this.inventarioService.consultarDisponibilidad(
      Number(id)
    );

  }

}
