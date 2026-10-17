import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudMaterial } from '../../solicitudes-material/entities/solicitud-material.entity';
import { EventoOutbox } from '../outbox/entities/evento-outbox.entity';
import { PubSubModule } from '../pubsub/pubsub.module';
import { EventoInbox } from './entities/evento-inbox.entity';
import { ProcesadorRespuestaInventarioService } from './procesador-respuesta-inventario.service';
import { PubSubInventarioConsumerService } from './pubsub-inventario-consumer.service';
import { ConsultaDisponibilidad } from '../disponibilidad/entities/consulta-disponibilidad.entity';
import { ConsultaDisponibilidadItem } from '../disponibilidad/entities/consulta-disponibilidad-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    EventoInbox,
    EventoOutbox,
    SolicitudMaterial,
    ConsultaDisponibilidad,
    ConsultaDisponibilidadItem,
  ]), PubSubModule],
  providers: [ProcesadorRespuestaInventarioService, PubSubInventarioConsumerService],
  exports: [ProcesadorRespuestaInventarioService, TypeOrmModule],
})
export class InboxModule {}
