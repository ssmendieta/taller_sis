import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObservacionOrden } from './entities/observacion-orden.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ObservacionOrden])],
})
export class ObservacionesModule {}
