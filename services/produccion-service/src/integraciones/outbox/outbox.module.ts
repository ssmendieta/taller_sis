import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoOutbox } from './entities/evento-outbox.entity';
import { PubSubModule } from '../pubsub/pubsub.module';
import { OUTBOX_CONFIG, loadOutboxConfig } from './outbox.config';
import { OutboxPublicadorService } from './outbox-publicador.service';
import { OUTBOX_STORE } from './outbox.store';
import { TypeOrmOutboxStore } from './typeorm-outbox.store';

@Module({
  imports: [TypeOrmModule.forFeature([EventoOutbox]), PubSubModule],
  providers: [
    TypeOrmOutboxStore,
    { provide: OUTBOX_STORE, useExisting: TypeOrmOutboxStore },
    { provide: OUTBOX_CONFIG, useFactory: loadOutboxConfig },
    OutboxPublicadorService,
  ],
  exports: [TypeOrmModule, OutboxPublicadorService],
})
export class OutboxModule {}
