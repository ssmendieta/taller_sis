import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';

import { InventarioService } from './inventario.service';



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
