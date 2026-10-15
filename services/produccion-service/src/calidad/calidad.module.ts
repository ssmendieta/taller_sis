import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { ResultadoConforme } from './entities/resultado-conforme.entity';
import { AvancesProduccion } from '../avances_produccion/entities/avances_produccion.entity';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { CalidadController } from './calidad.controller';
import { CalidadService } from './calidad.service';

@Module({
  imports: [TypeOrmModule.forFeature([ResultadoConforme, OrdenProduccion, AvancesProduccion])],
  controllers: [CalidadController],
  providers: [CalidadService, PermisoProduccionGuard],
  exports: [TypeOrmModule, CalidadService],
})
export class CalidadModule {}
