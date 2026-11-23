import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Lote } from './entities/lote.entity';
import { LotesService } from './lotes.service';
import { LotesController } from './lotes.controller';
import { EventoOutbox } from '../integraciones/outbox/entities/evento-outbox.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Lote, OrdenProduccion, ResultadoConforme, EventoOutbox])],
  providers: [LotesService],
  controllers: [LotesController],
  exports: [LotesService, TypeOrmModule],
})
export class LotesModule {}
