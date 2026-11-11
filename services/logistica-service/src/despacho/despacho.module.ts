import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { Ruta } from '../rutas/entities/ruta.entity';
import { RutaParada } from '../rutas/entities/ruta-parada.entity';
import { RutaParadaBoleta } from '../rutas/entities/ruta-parada-boleta.entity';
import { DespachoController } from './despacho.controller';
import { DespachoService } from './despacho.service';
import { OutboxLogisticaModule } from '../integraciones/outbox/outbox.module';
import { OutboxEventosDespacho } from '../integraciones/outbox/outbox-eventos-despacho';
import { EVENTOS_DESPACHO } from './eventos-despacho';

@Module({
  imports: [TypeOrmModule.forFeature([Ruta, RutaParada, RutaParadaBoleta]), OutboxLogisticaModule],
  controllers: [DespachoController],
  providers: [
    PermisoLogisticaGuard,
    DespachoService,
    // ABC-386: el despacho guarda su evento en el outbox de Logística.
    { provide: EVENTOS_DESPACHO, useExisting: OutboxEventosDespacho },
  ],
})
export class DespachoModule {}
