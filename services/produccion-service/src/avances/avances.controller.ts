import {
  Controller,
  Post,
  Get,
  Param,
  Body,
} from '@nestjs/common';

import { AvancesService } from './avances.service';



@Controller('avances')
export class AvancesController {


  constructor(
    private readonly avancesService: AvancesService,
  ) {}



  // Registrar avance
  @Post(':ordenId')
  registrar(
    @Param('ordenId') ordenId: string,
    @Body() data: any,
  ) {


    return this.avancesService.registrar(

      Number(ordenId),

      Number(data.cantidad),

      Number(data.usuario_id || 1),

    );

  }





  // Listar avances de una orden
  @Get(':ordenId')
  listar(
    @Param('ordenId') ordenId: string,
  ) {


    return this.avancesService.listarPorOrden(
      Number(ordenId),
    );

  }




  // Total producido
  @Get(':ordenId/total')
  total(
    @Param('ordenId') ordenId:string,
  ){


    return this.avancesService.totalProducido(
      Number(ordenId),
    );

  }


}