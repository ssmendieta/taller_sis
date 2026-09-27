import { Module } from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import { OrdenProduccion} from './entities/ordenes_produccion.entity';
import { OrdenesProduccionService } from './ordenes_produccion.service';
import { OrdenesProduccionController } from './ordenes_produccion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OrdenProduccion])],
  controllers: [OrdenesProduccionController],
  providers: [OrdenesProduccionService],
})
export class OrdenesProduccionModule {}
