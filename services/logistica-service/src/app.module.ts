import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { SolicitudesSalidaModule } from './solicitudes-salida/solicitudes-salida.module';

@Module({
  imports: [DatabaseModule, HealthModule, SolicitudesSalidaModule],
  controllers: [AppController],
})
export class AppModule {}
