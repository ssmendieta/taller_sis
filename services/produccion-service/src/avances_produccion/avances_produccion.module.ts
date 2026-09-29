import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvancesProduccion} from './entities/avances_produccion.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { AvancesProduccionService } from './avances_produccion.service';
import { AvancesProduccionController } from './avances_produccion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AvancesProduccion, OrdenProduccion])],
  controllers: [AvancesProduccionController],
  providers: [AvancesProduccionService],
})
export class AvancesProduccionModule {}
