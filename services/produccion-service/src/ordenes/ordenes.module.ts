import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrdenProduccion } from './entities/orden-produccion.entity';
import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';
import { Inventario } from '../inventario/entities/inventario.entity';

import { OrdenesService } from './ordenes.service';
import { OrdenesController } from './ordenes.controller';
import { RecetasModule } from '../recetas/recetas.module';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrdenProduccion,
      HistorialEstadoOrden,
      Inventario,
    ]),
    RecetasModule,
  ],
  controllers: [OrdenesController],
  providers: [OrdenesService, PermisoProduccionGuard],
})
export class OrdenesModule {}
