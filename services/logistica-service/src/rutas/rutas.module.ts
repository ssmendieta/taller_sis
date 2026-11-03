import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { Ruta } from './entities/ruta.entity';
import { RutaParada } from './entities/ruta-parada.entity';
import { RutaParadaBoleta } from './entities/ruta-parada-boleta.entity';
import { RutasController } from './rutas.controller';
import { RutasService } from './rutas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ruta, RutaParada, RutaParadaBoleta])],
  controllers: [RutasController],
  providers: [PermisoLogisticaGuard, RutasService],
})
export class RutasModule {}
