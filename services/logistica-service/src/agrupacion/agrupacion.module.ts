import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { AgrupacionController } from './agrupacion.controller';
import { AgrupacionService } from './agrupacion.service';
import { GrupoSalida } from './entities/grupo-salida.entity';
import { GrupoSolicitud } from './entities/grupo-solicitud.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GrupoSalida, GrupoSolicitud])],
  controllers: [AgrupacionController],
  providers: [AgrupacionService, LotesProduccionClient],
})
export class AgrupacionModule {}
