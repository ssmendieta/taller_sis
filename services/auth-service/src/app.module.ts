import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';

@Module({
  imports: [DatabaseModule, HealthModule],
  controllers: [AppController, AuthController],
  providers: [AuthService],
})
export class AppModule {}