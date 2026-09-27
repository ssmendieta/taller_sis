import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { Material } from './entities/material.entity';

import { MaterialesService } from './materiales.service';

import { MaterialesController } from './materiales.controller';



@Module({

  imports: [
    TypeOrmModule.forFeature([
      Material
    ]),
  ],


  controllers: [
    MaterialesController,
  ],


  providers: [
    MaterialesService,
  ],


  exports: [
    MaterialesService,
  ],

})

export class MaterialesModule {}