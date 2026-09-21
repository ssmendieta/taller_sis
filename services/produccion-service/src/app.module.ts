import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { RecetasModule } from './recetas/recetas.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    RecetasModule
  ],
  controllers: [AppController],
})
export class AppModule {}