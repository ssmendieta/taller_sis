import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { SolicitudesSalidaModule } from './solicitudes-salida/solicitudes-salida.module';
import { BoletasModule } from './boletas/boletas.module';
import { DisponibilidadDocumentalModule } from './disponibilidad-documental/disponibilidad-documental.module';
import { TrazabilidadModule } from './trazabilidad/trazabilidad.module';
import { RutasModule } from './rutas/rutas.module';
import { DespachoModule } from './despacho/despacho.module';
import { IncidenciasModule } from './incidencias/incidencias.module';
import { AgrupacionModule } from './agrupacion/agrupacion.module';
import { ReportesModule } from './reportes/reportes.module';
import { HistorialModule } from './historial/historial.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RecursosExternosModule } from './recursos-externos/recursos-externos.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    SolicitudesSalidaModule,
    BoletasModule,
    DisponibilidadDocumentalModule,
    TrazabilidadModule,
    RutasModule,
    DespachoModule,
    IncidenciasModule,
    AgrupacionModule,
    ReportesModule,
    HistorialModule,
    DashboardModule,
    RecursosExternosModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
