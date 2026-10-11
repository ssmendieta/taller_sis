import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudMaterial } from './entities/solicitud-material.entity';
import { SolicitudMaterialItem } from './entities/solicitud-material-item.entity';
import { Material } from '../materiales/entities/material.entity';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { SolicitudesMaterialController } from './solicitudes-material.controller';
import { SolicitudesMaterialService } from './solicitudes-material.service';

@Module({
  imports: [TypeOrmModule.forFeature([SolicitudMaterial, SolicitudMaterialItem, OrdenProduccion, Material])],
  controllers: [SolicitudesMaterialController],
  providers: [SolicitudesMaterialService, PermisoProduccionGuard],
  exports: [TypeOrmModule, SolicitudesMaterialService],
})
export class SolicitudesMaterialModule {}
