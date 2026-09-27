import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdenesService } from './ordenes.service';
import { OrdenesController } from './ordenes.controller';
import { OrdenProduccion } from './entities/orden-produccion.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrdenProduccion])],
  controllers: [OrdenesController],
  providers: [OrdenesService],
})
export class OrdenesModule {}
