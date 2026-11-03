import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoInbox } from '../integraciones/inbox/entities/evento-inbox.entity';
import { PubSubModule } from '../integraciones/pubsub/pubsub.module';
import { DemandaItem } from './entities/demanda-item.entity';
import { Demanda } from './entities/demanda.entity';
import { ProcesadorDemandaService } from './procesador-demanda.service';
import { PubSubDemandaConsumerService } from './pubsub-demanda-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Demanda, DemandaItem, EventoInbox]), PubSubModule],
  providers: [ProcesadorDemandaService, PubSubDemandaConsumerService],
  exports: [TypeOrmModule, ProcesadorDemandaService],
})
export class DemandaModule {}
