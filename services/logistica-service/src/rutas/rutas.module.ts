import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ruta } from './entities/ruta.entity';
import { RutaParada } from './entities/ruta-parada.entity';
import { RutaParadaBoleta } from './entities/ruta-parada-boleta.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ruta, RutaParada, RutaParadaBoleta])],
})
export class RutasModule {}
