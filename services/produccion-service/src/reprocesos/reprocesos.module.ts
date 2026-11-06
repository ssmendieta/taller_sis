import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Reproceso } from './entities/reproceso.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Reproceso, ResultadoConforme, OrdenProduccion])],
  exports: [TypeOrmModule],
})
export class ReprocesosModule {}
