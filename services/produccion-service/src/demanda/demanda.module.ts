import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoInbox } from '../integraciones/inbox/entities/evento-inbox.entity';
import { PubSubModule } from '../integraciones/pubsub/pubsub.module';
import { DemandaController } from './demanda.controller';
import { DemandaService } from './demanda.service';
import { DemandaItem } from './entities/demanda-item.entity';
import { DemandaRechazada } from './entities/demanda-rechazada.entity';
import { Demanda } from './entities/demanda.entity';
import { ProcesadorDemandaService } from './procesador-demanda.service';
import { PubSubDemandaConsumerService } from './pubsub-demanda-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Demanda, DemandaItem, DemandaRechazada, EventoInbox]), PubSubModule],
  controllers: [DemandaController],
  providers: [DemandaService, ProcesadorDemandaService, PubSubDemandaConsumerService],
  exports: [TypeOrmModule, DemandaService, ProcesadorDemandaService],
})
export class DemandaModule {}
