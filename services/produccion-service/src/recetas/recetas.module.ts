import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Material } from '../materiales/entities/material.entity';
import { Receta } from './entities/receta.entity';
import { RecetaMaterial } from './entities/receta-material.entity';
import { RecetasController } from './recetas.controller';
import { RecetasService } from './recetas.service';
import { RecetasVersionService } from './recetas-version.service';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { SesionGuard } from '../auth/sesion.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Receta, RecetaMaterial, Material]),
  ],
  controllers: [RecetasController],
  providers: [
    RecetasService,
    RecetasVersionService,
    PermisoProduccionGuard,
    SesionGuard,
  ],
  exports: [RecetasService],
})
export class RecetasModule {}
