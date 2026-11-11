import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ruta } from '../../rutas/entities/ruta.entity';
import { OutboxLogisticaModule } from '../outbox/outbox.module';
import { EventoInbox } from './entities/evento-inbox.entity';
import { ProcesadorResultadoSalidaService } from './procesador-resultado-salida.service';
import { PubSubResultadoSalidaConsumer } from './pubsub-resultado-salida.consumer';

@Module({
  imports: [TypeOrmModule.forFeature([EventoInbox, Ruta]), OutboxLogisticaModule],
  providers: [ProcesadorResultadoSalidaService, PubSubResultadoSalidaConsumer],
  exports: [ProcesadorResultadoSalidaService],
})
export class InboxLogisticaModule {}
