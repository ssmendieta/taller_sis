import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrdenProduccion])],
  controllers: [HistorialController],
  providers: [HistorialService, PermisoProduccionGuard],
})
export class HistorialModule {}
