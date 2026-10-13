import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { SolicitudSalida } from '../solicitudes-salida/entities/solicitud-salida.entity';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioItem } from './entities/boleta-envio-item.entity';
import { BoletasController } from './boletas.controller';
import { BoletasService } from './boletas.service';
import { DisponibilidadDocumentalModule } from '../disponibilidad-documental/disponibilidad-documental.module';

@Module({
  imports: [TypeOrmModule.forFeature([BoletaEnvio, BoletaEnvioItem, SolicitudSalida]), DisponibilidadDocumentalModule],
  controllers: [BoletasController],
  providers: [PermisoLogisticaGuard, BoletasService],
})
export class BoletasModule {}
