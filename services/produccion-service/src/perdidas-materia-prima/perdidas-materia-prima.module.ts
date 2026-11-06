import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { RecetaMaterial } from '../recetas/entities/receta-material.entity';
import { PerdidaMateriaPrima } from './entities/perdida-materia-prima.entity';
import { PerdidasMateriaPrimaController } from './perdidas-materia-prima.controller';
import { PerdidasMateriaPrimaService } from './perdidas-materia-prima.service';

@Module({
  imports: [TypeOrmModule.forFeature([PerdidaMateriaPrima, OrdenProduccion, Material, RecetaMaterial])],
  controllers: [PerdidasMateriaPrimaController],
  providers: [PerdidasMateriaPrimaService, PermisoProduccionGuard],
  exports: [TypeOrmModule, PerdidasMateriaPrimaService],
})
export class PerdidasMateriaPrimaModule {}
