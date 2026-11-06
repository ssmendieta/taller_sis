import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidenciaTransporte } from './entities/incidencia-transporte.entity';
import { ReprogramacionRuta } from './entities/reprogramacion-ruta.entity';

// ABC-379: incidencias y reprogramaciones. ABC-380 registra el modelo; los
// endpoints y la pantalla se agregan en las subtareas siguientes.
@Module({
  imports: [TypeOrmModule.forFeature([IncidenciaTransporte, ReprogramacionRuta])],
  exports: [TypeOrmModule],
})
export class IncidenciasModule {}
