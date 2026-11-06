import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AvancesProduccionModule } from './avances_produccion/avances_produccion.module';
import { OrdenesModule } from './ordenes/ordenes.module';
import { RecetasModule } from './recetas/recetas.module';
import { MaterialesModule } from './materiales/materiales.module';
import { InventarioModule } from './inventario/inventario.module';
import { UnidadesModule } from './unidades/unidades.module';
import { MaterialCalculationModule } from './material-calculation/material-calculation.module';
import { PubSubModule } from './integraciones/pubsub/pubsub.module';
import { SolicitudesMaterialModule } from './solicitudes-material/solicitudes-material.module';
import { ConsumosMaterialModule } from './consumos-material/consumos-material.module';
import { CalidadModule } from './calidad/calidad.module';
import { LotesModule } from './lotes/lotes.module';
import { IntegracionesModule } from './integraciones/integraciones.module';
import { CierreProduccionModule } from './cierre-produccion/cierre-produccion.module';
import { ObservacionesModule } from './observaciones/observaciones.module';
import { DemandaModule } from './demanda/demanda.module';
import { PerdidasMateriaPrimaModule } from './perdidas-materia-prima/perdidas-materia-prima.module';

@Module({
  imports: [
    DatabaseModule,
    IntegracionesModule,
    HealthModule,
    AvancesProduccionModule,
    OrdenesModule,
    RecetasModule,
    MaterialesModule,
    InventarioModule,
    UnidadesModule,
    SolicitudesMaterialModule,
    ConsumosMaterialModule,
    PerdidasMateriaPrimaModule,
    MaterialCalculationModule,
    LotesModule,
    CierreProduccionModule,
    ObservacionesModule,
    DemandaModule,
    CalidadModule,
    PubSubModule,
    CalidadModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
