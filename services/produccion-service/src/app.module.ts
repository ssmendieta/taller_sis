import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { MaterialCalculationService } from './material-calculation/material-calculation.service';

@Module({
  imports: [DatabaseModule, HealthModule],

  controllers: [AppController],

  providers: [MaterialCalculationService],
})
export class AppModule {}