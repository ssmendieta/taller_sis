import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { PerdidaMateriaPrima } from './entities/perdida-materia-prima.entity';

// ABC-74, subtarea 1: solo persistencia. El registro y la consulta se agregan en
// las subtareas siguientes usando este repositorio.
@Module({
  imports: [TypeOrmModule.forFeature([PerdidaMateriaPrima, OrdenProduccion, Material])],
  exports: [TypeOrmModule],
})
export class PerdidasMateriaPrimaModule {}
