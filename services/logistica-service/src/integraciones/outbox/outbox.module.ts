import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PubSubLogisticaPublisher,
  pubSubLogisticaClientProvider,
  pubSubLogisticaConfigProvider,
  PUBSUB_LOGISTICA_CLIENT,
} from '../pubsub/pubsub-logistica.client';
import { PUBSUB_LOGISTICA_CONFIG } from '../pubsub/pubsub-logistica.config';
import { EventoOutbox } from './entities/evento-outbox.entity';
import { OutboxEventosDespacho } from './outbox-eventos-despacho';
import { OutboxPublicadorService } from './outbox-publicador.service';
import { OutboxStore } from './outbox.store';

@Module({
  imports: [TypeOrmModule.forFeature([EventoOutbox])],
  providers: [
    pubSubLogisticaConfigProvider,
    pubSubLogisticaClientProvider,
    PubSubLogisticaPublisher,
    OutboxStore,
    OutboxPublicadorService,
    OutboxEventosDespacho,
  ],
  exports: [OutboxEventosDespacho, OutboxStore, PUBSUB_LOGISTICA_CONFIG, PUBSUB_LOGISTICA_CLIENT, TypeOrmModule],
})
export class OutboxLogisticaModule {}
