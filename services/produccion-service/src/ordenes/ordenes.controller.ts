import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';


import { OrdenesService } from './ordenes.service';



@Controller('ordenes')
export class OrdenesController {


  constructor(
    private readonly ordenesService: OrdenesService,
  ) {}



  @Get(':id/materiales')
  obtenerMateriales(
    @Param('id') id:string,
  ){

    return this.ordenesService.obtenerMateriales(
      Number(id)
    );

  }

}