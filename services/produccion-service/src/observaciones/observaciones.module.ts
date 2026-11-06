import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { ObservacionOrden } from './entities/observacion-orden.entity';
import { ObservacionesController } from './observaciones.controller';
import { ObservacionesService } from './observaciones.service';

@Module({
  imports: [TypeOrmModule.forFeature([ObservacionOrden, OrdenProduccion])],
  controllers: [ObservacionesController],
  providers: [ObservacionesService, PermisoProduccionGuard],
})
export class ObservacionesModule {}
