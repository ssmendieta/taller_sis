import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Reproceso } from './entities/reproceso.entity';
import { ReprocesosController } from './reprocesos.controller';
import { ReprocesosService } from './reprocesos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reproceso, ResultadoConforme, OrdenProduccion])],
  controllers: [ReprocesosController],
  providers: [ReprocesosService],
  exports: [TypeOrmModule],
})
export class ReprocesosModule {}
