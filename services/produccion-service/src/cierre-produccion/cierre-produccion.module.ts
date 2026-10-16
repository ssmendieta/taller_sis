import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { CierreProduccion } from './entities/cierre-produccion.entity';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { ConsumoMaterial } from '../consumos-material/entities/consumo-material.entity';
import { Material } from '../materiales/entities/material.entity';
import { Receta } from '../recetas/entities/receta.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CierreProduccionController } from './cierre-produccion.controller';
import { CierreProduccionService } from './cierre-produccion.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    CierreProduccion, OrdenProduccion, AvancesProduccion, ResultadoConforme,
    ConsumoMaterial, Material, Receta, RecetaMaterial,
  ])],
  controllers: [CierreProduccionController],
  providers: [CierreProduccionService, PermisoProduccionGuard],
  exports: [TypeOrmModule, CierreProduccionService],
})
export class CierreProduccionModule {}
