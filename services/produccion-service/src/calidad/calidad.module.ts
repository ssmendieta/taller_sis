import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { CalidadController } from './calidad.controller';
import { CalidadService } from './calidad.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrdenProduccion])],
  controllers: [CalidadController],
  providers: [CalidadService, PermisoProduccionGuard],
})
export class CalidadModule {}
