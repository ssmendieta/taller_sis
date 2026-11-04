import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumoMaterial } from './entities/consumo-material.entity';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Receta } from '../recetas/entities/receta.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { ConsumosMaterialController } from './consumos-material.controller';
import { ConsumosMaterialService } from './consumos-material.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConsumoMaterial, OrdenProduccion, Material, Receta, RecetaMaterial])],
  controllers: [ConsumosMaterialController],
  providers: [ConsumosMaterialService, PermisoProduccionGuard],
  exports: [TypeOrmModule, ConsumosMaterialService],
})
export class ConsumosMaterialModule {}
