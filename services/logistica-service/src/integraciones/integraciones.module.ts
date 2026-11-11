import { Module } from '@nestjs/common';
import { PermisoLogisticaGuard } from '../auth/permiso-logistica.guard';
import { InboxLogisticaModule } from './inbox/inbox.module';
import { IntegracionesLogisticaController } from './integraciones.controller';
import { IntegracionesLogisticaService } from './integraciones.service';
import { OutboxLogisticaModule } from './outbox/outbox.module';

@Module({
  imports: [OutboxLogisticaModule, InboxLogisticaModule],
  controllers: [IntegracionesLogisticaController],
  providers: [PermisoLogisticaGuard, IntegracionesLogisticaService],
})
export class IntegracionesLogisticaModule {}
