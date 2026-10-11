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
import { MaterialCalculationService } from './material-calculation/material-calculation.service';
import { MaterialCalculationController } from './material-calculation/material-calculation.controller';
import { PubSubModule } from './integraciones/pubsub/pubsub.module';
import { SolicitudesMaterialModule } from './solicitudes-material/solicitudes-material.module';

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
    PubSubModule,
  ],
  controllers: [AppController, MaterialCalculationController],
  providers: [
    MaterialCalculationService,
  ],
})
export class AppModule {}
