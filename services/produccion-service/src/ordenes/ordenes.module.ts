import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { Orden } from './entities/orden.entity';

import { OrdenesService } from './ordenes.service';

import { OrdenesController } from './ordenes.controller';



@Module({

  imports:[
    TypeOrmModule.forFeature([
      Orden
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