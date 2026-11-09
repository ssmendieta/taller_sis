import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RutasModule } from '../rutas/rutas.module';
import { IncidenciasController } from './incidencias.controller';
import { IncidenciasService } from './incidencias.service';
import { IncidenciaTransporte } from './entities/incidencia-transporte.entity';
import { ReprogramacionRuta } from './entities/reprogramacion-ruta.entity';

@Module({
  imports: [TypeOrmModule.forFeature([IncidenciaTransporte, ReprogramacionRuta]), RutasModule],
  controllers: [IncidenciasController],
  providers: [IncidenciasService],
  exports: [TypeOrmModule],
})
export class IncidenciasModule {}
