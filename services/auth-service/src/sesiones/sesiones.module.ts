import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sesion } from './entities/sesion.entity';
import { SesionesService } from './sesiones.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sesion])],
  providers: [SesionesService],
  exports: [SesionesService],
})
export class SesionesModule {}
