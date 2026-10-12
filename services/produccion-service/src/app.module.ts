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

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AvancesProduccionModule,
    OrdenesModule,
    RecetasModule,
    MaterialesModule,
    InventarioModule,
    UnidadesModule,
    SolicitudesMaterialModule,
    ConsumosMaterialModule,
    MaterialCalculationModule,
    CalidadModule,
    PubSubModule,
    CalidadModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
