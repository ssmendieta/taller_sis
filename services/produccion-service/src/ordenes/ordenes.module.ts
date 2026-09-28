import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrdenProduccion } from './entities/orden-produccion.entity';

import { HistorialEstadoOrden } from './entities/historial-estado-orden.entity';

import { OrdenesService } from './ordenes.service';
import { OrdenesController } from './ordenes.controller';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';

@Module({

  imports:[
    TypeOrmModule.forFeature([
      OrdenProduccion,
      HistorialEstadoOrden
    ])
  ],


  controllers:[
    OrdenesController
  ],


  providers:[
    OrdenesService,
    PermisoProduccionGuard
  ]

})
export class OrdenesModule {}
