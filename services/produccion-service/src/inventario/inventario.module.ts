import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { Inventario } from './entities/inventario.entity';

import { InventarioService } from './inventario.service';

import { InventarioController } from './inventario.controller';

import { SesionGuard } from '../auth/sesion.guard';



@Module({

  imports: [
    TypeOrmModule.forFeature([
      Inventario
    ]),
  ],


  controllers: [
    InventarioController,
  ],


  providers: [
    InventarioService,
    SesionGuard,
  ],

})

export class InventarioModule {}