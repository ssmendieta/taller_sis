import { Module } from '@nestjs/common';
import { UnidadesController } from './unidades.controller';
import { SesionGuard } from '../auth/sesion.guard';

@Module({
  controllers: [UnidadesController],
  providers: [SesionGuard],
})
export class UnidadesModule {}
