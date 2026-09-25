import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module';

import { AppController } from './app.controller';

import { DatabaseModule } from './database/database.module';

import { UsersModule } from './users/users.module';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './auth/guards/roles.guard';


@Module({

  imports: [
    DatabaseModule,
    HealthModule,
    UsersModule
  ],

  controllers: [
    AppController
  ],

})

export class AppModule {}