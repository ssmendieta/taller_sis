import { Module } from '@nestjs/common';
import { PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { IntegracionesController } from './integraciones.controller';
import { IntegracionesService } from './integraciones.service';
import { OutboxModule } from './outbox/outbox.module';
import { PubSubModule } from './pubsub/pubsub.module';

@Module({
  imports: [OutboxModule, PubSubModule],
  controllers: [IntegracionesController],
  providers: [IntegracionesService, PermisoProduccionGuard],
})
export class IntegracionesModule {}
