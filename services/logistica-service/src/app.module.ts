import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { SolicitudesSalidaModule } from './solicitudes-salida/solicitudes-salida.module';
import { BoletasModule } from './boletas/boletas.module';
import { DisponibilidadDocumentalModule } from './disponibilidad-documental/disponibilidad-documental.module';
import { TrazabilidadModule } from './trazabilidad/trazabilidad.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    SolicitudesSalidaModule,
    BoletasModule,
    DisponibilidadDocumentalModule,
    TrazabilidadModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
