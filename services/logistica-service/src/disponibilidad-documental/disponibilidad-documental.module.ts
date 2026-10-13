import { Module } from '@nestjs/common';
import { LotesProduccionClient } from './lotes-produccion.client';

@Module({
  providers: [LotesProduccionClient],
  exports: [LotesProduccionClient],
})
export class DisponibilidadDocumentalModule {}
