import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { SolicitudSalida } from './entities/solicitud-salida.entity';
import { SolicitudSalidaItem } from './entities/solicitud-salida-item.entity';
import { SolicitudesSalidaController } from './solicitudes-salida.controller';
import { SolicitudesSalidaService } from './solicitudes-salida.service';

@Module({
  imports: [TypeOrmModule.forFeature([SolicitudSalida, SolicitudSalidaItem])],
  controllers: [SolicitudesSalidaController],
  providers: [PermisoLogisticaGuard, SolicitudesSalidaService],
})
export class SolicitudesSalidaModule {}
