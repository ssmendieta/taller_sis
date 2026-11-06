import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { Ruta } from '../rutas/entities/ruta.entity';
import { RutaParada } from '../rutas/entities/ruta-parada.entity';
import { RutaParadaBoleta } from '../rutas/entities/ruta-parada-boleta.entity';
import { DespachoController } from './despacho.controller';
import { DespachoService } from './despacho.service';
import { EVENTOS_DESPACHO, SIN_EVENTOS_DESPACHO } from './eventos-despacho';

@Module({
  imports: [TypeOrmModule.forFeature([Ruta, RutaParada, RutaParadaBoleta])],
  controllers: [DespachoController],
  providers: [
    PermisoLogisticaGuard,
    DespachoService,
    // ABC-386 reemplaza este proveedor por el que guarda el evento en el outbox.
    { provide: EVENTOS_DESPACHO, useValue: SIN_EVENTOS_DESPACHO },
  ],
})
export class DespachoModule {}
