import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { Material } from './entities/material.entity';

import { MaterialesService } from './materiales.service';

import { MaterialesController } from './materiales.controller';

import { SesionGuard } from '../auth/sesion.guard';



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
    SesionGuard,
  ],


  exports: [
    MaterialesService,
  ],

})

export class MaterialesModule {}