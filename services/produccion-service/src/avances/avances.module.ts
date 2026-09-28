import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Avance } from './entities/avance.entity';
import { AvancesService } from './avances.service';
import { AvancesController } from './avances.controller';



@Module({

  imports:[
    TypeOrmModule.forFeature([
      Avance
    ])
  ],


  controllers:[
    AvancesController
  ],


  providers:[
    AvancesService
  ]

})
export class AvancesModule {}