import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { RecetasModule } from './recetas/recetas.module';
import { MaterialesModule } from './materiales/materiales.module';
import { OrdenesModule } from './ordenes/ordenes.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    OrdenesModule,
    RecetasModule,
    MaterialesModule,
  ],

  controllers: [
    AppController
  ],
})
export class AppModule {}