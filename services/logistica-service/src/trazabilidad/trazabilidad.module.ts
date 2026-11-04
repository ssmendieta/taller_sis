import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { BoletaEnvio } from '../boletas/entities/boleta-envio.entity';
import { BoletaEnvioItem } from '../boletas/entities/boleta-envio-item.entity';
import { BoletaEnvioHistorial } from '../boletas/entities/boleta-envio-historial.entity';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { DisponibilidadDocumentalModule } from '../disponibilidad-documental/disponibilidad-documental.module';
import { TrazabilidadController } from './trazabilidad.controller';
import { TrazabilidadService } from './trazabilidad.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BoletaEnvio, BoletaEnvioItem, BoletaEnvioHistorial, SolicitudSalida]),
    DisponibilidadDocumentalModule,
  ],
  controllers: [TrazabilidadController],
  providers: [PermisoLogisticaGuard, TrazabilidadService],
  exports: [TrazabilidadService],
})
export class TrazabilidadModule {}
