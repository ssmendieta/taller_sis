import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [DatabaseModule, HealthModule],
  controllers: [AppController],
})
export class AppModule {}
