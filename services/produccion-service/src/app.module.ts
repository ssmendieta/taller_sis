import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { MaterialCalculationService } from './material-calculation/material-calculation.service';
import { MaterialCalculationController } from './material-calculation/material-calculation.controller';
import { RecetasVersionService } from './recetas/recetas-version.service';

@Module({
  imports: [DatabaseModule, HealthModule],

  controllers: [AppController, MaterialCalculationController],

  providers: [
    MaterialCalculationService,
    RecetasVersionService,
  ],
})
export class AppModule {}