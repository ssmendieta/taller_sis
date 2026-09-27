import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { Orden } from './entities/orden.entity';

import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';

import { OrdenesService } from './ordenes.service';

import { OrdenesController } from './ordenes.controller';



@Module({

  imports:[
    TypeOrmModule.forFeature([
      Orden,
      HistorialEstadoOrden
    ])
  ],


  controllers:[
    OrdenesController
  ],


  providers:[
    OrdenesService
  ]

})
export class OrdenesModule {}