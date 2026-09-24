import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { Usuario } from './entities/usuario.entity';

import { UsersService } from './users.service';

import { UsersController } from './users.controller';

import { AdminSeedService } from '../database/seeds/admin.seed.service';


@Module({

  imports: [
    TypeOrmModule.forFeature([Usuario]),
  ],

  controllers: [
    UsersController,
  ],

  providers: [
    UsersService,
    AdminSeedService,
  ],

  exports: [
    UsersService,
  ],

})

export class UsersModule {}