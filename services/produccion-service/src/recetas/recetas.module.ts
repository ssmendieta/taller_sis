import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Material } from '../materiales/entities/material.entity';
import { Receta } from './entities/receta.entity';
import { RecetaMaterial } from './entities/receta-material.entity';
import { RecetasController } from './recetas.controller';
import { RecetasService } from './recetas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Receta, RecetaMaterial, Material]),
  ],
  controllers: [RecetasController],
  providers: [RecetasService],
  exports: [RecetasService],
})
export class RecetasModule {}
