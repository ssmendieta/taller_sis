import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { LotesProduccionClient } from '../disponibilidad-documental/lotes-produccion.client';
import { RecursosExternosModule } from '../recursos-externos/recursos-externos.module';
import { Ruta } from './entities/ruta.entity';
import { RutaParada } from './entities/ruta-parada.entity';
import { RutaParadaBoleta } from './entities/ruta-parada-boleta.entity';
import { RutasController } from './rutas.controller';
import { RutasService } from './rutas.service';
import { ValidacionAsignacionService } from './validaciones/validacion-asignacion.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ruta, RutaParada, RutaParadaBoleta]), RecursosExternosModule],
  exports: [ValidacionAsignacionService],
  controllers: [RutasController],
  providers: [PermisoLogisticaGuard, RutasService, ValidacionAsignacionService, LotesProduccionClient],
})
export class RutasModule {}
