import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Lote } from './entities/lote.entity';
import { LotesService } from './lotes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Lote, OrdenProduccion, ResultadoConforme])],
  providers: [LotesService],
  exports: [LotesService, TypeOrmModule],
})
export class LotesModule {}
