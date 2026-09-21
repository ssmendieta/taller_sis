import { Module } from '@nestjs/common';

import { HealthModule } from './health/health.module';

import { AppController } from './app.controller';

import { DatabaseModule } from './database/database.module';

import { UsersModule } from './users/users.module';


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