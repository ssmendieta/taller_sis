import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { MaterialCalculationService } from './material-calculation/material-calculation.service';
import { MaterialCalculationController } from './material-calculation/material-calculation.controller';

@Module({
  imports: [DatabaseModule, HealthModule],

  controllers: [AppController, MaterialCalculationController],

  providers: [MaterialCalculationService],
})
export class AppModule {}