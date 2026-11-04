import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvancesProduccion} from './entities/avances_produccion.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { AvancesProduccionService } from './avances_produccion.service';
import { AvancesProduccionController } from './avances_produccion.controller';
import { AvancesPantallaController } from './avances-pantalla.controller';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';

@Module({
  imports: [TypeOrmModule.forFeature([AvancesProduccion, OrdenProduccion])],
  controllers: [AvancesProduccionController, AvancesPantallaController],
  providers: [AvancesProduccionService, PermisoProduccionGuard],
})
export class AvancesProduccionModule {}
