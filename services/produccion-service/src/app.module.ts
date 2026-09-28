import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { RecetasModule } from './recetas/recetas.module';
import { MaterialesModule } from './materiales/materiales.module';
import { OrdenesModule } from './ordenes/ordenes.module';
import { InventarioModule } from './inventario/inventario.module';
import { AvancesModule } from './avances/avances.module';

@Module({
  imports: [
  DatabaseModule,
  HealthModule,
  OrdenesModule,
  RecetasModule,
  MaterialesModule,
  InventarioModule,
  AvancesModule,
],

  controllers: [
    AppController
  ],
})
export class AppModule {}