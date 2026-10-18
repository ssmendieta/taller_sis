import { Module } from '@nestjs/common';
import { LotesProduccionClient } from './lotes-produccion.client';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoletaEnvio } from '../boletas/entities/boleta-envio.entity';
import { BoletaEnvioItem } from '../boletas/entities/boleta-envio-item.entity';
import { DisponibilidadDocumentalController } from './disponibilidad-documental.controller';
import { DisponibilidadDocumentalService } from './disponibilidad-documental.service';

@Module({
  imports: [TypeOrmModule.forFeature([BoletaEnvio, BoletaEnvioItem])],
  controllers: [DisponibilidadDocumentalController],
  providers: [LotesProduccionClient, DisponibilidadDocumentalService],
  exports: [LotesProduccionClient, DisponibilidadDocumentalService],
})
export class DisponibilidadDocumentalModule {}
