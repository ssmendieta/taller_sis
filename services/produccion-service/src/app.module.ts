import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { RecetasModule } from './recetas/recetas.module';
import { MaterialesModule } from './materiales/materiales.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    RecetasModule,
    MaterialesModule,
  ],

  controllers: [
    AppController
  ],
})
export class AppModule {}