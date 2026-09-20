import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { ProxyModule } from './proxy/proxy.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ProxyModule, HealthModule],
  controllers: [AppController],
})
export class AppModule {}
