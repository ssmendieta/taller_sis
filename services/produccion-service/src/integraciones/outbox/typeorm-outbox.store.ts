import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Brackets, DataSource } from 'typeorm';
import {
  ESTADO_OUTBOX_PENDIENTE,
  ESTADO_OUTBOX_PROCESANDO,
  ESTADO_OUTBOX_PUBLICADO,
  EventoOutbox,
} from './entities/evento-outbox.entity';
import { OutboxStore, ReclamarEventosOptions } from './outbox.store';

@Injectable()
export class TypeOrmOutboxStore implements OutboxStore {
  constructor(private readonly dataSource: DataSource) {}

  reclamarPendientes(options: ReclamarEventosOptions): Promise<EventoOutbox[]> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EventoOutbox);
      const eventos = await repository
        .createQueryBuilder('evento')
        .where(new Brackets((query) => {
          query
            .where(
              'evento.estado = :pendiente AND evento.proximo_intento_en <= :ahora',
              { pendiente: ESTADO_OUTBOX_PENDIENTE, ahora: options.ahora },
            )
            .orWhere(
              'evento.estado = :procesando AND evento.bloqueo_hasta <= :ahora',
              { procesando: ESTADO_OUTBOX_PROCESANDO, ahora: options.ahora },
            );
        }))
        .orderBy('evento.creado_en', 'ASC')
        .addOrderBy('evento.id', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .take(options.limite)
        .getMany();

      const bloqueoToken = randomUUID();
      const bloqueoHasta = new Date(options.ahora.getTime() + options.leaseMs);
      for (const evento of eventos) {
        evento.estado = ESTADO_OUTBOX_PROCESANDO;
        evento.intentos += 1;
        evento.ultimoIntentoEn = options.ahora;
        evento.bloqueoToken = bloqueoToken;
        evento.bloqueoHasta = bloqueoHasta;
      }
      if (eventos.length > 0) await repository.save(eventos);
      return eventos;
    });
  }

  async marcarPublicado(
    evento: EventoOutbox,
    messageId: string,
    publicadoEn: Date,
  ): Promise<boolean> {
    const resultado = await this.dataSource.getRepository(EventoOutbox).update(
      {
        id: evento.id,
        estado: ESTADO_OUTBOX_PROCESANDO,
        bloqueoToken: evento.bloqueoToken,
      },
      {
        estado: ESTADO_OUTBOX_PUBLICADO,
        messageId,
        publicadoEn,
        ultimoError: null,
        bloqueoToken: null,
        bloqueoHasta: null,
      },
    );
    return resultado.affected === 1;
  }

  async marcarFallo(
    evento: EventoOutbox,
    error: string,
    proximoIntentoEn: Date,
  ): Promise<boolean> {
    const resultado = await this.dataSource.getRepository(EventoOutbox).update(
      {
        id: evento.id,
        estado: ESTADO_OUTBOX_PROCESANDO,
        bloqueoToken: evento.bloqueoToken,
      },
      {
        estado: ESTADO_OUTBOX_PENDIENTE,
        ultimoError: error,
        proximoIntentoEn,
        bloqueoToken: null,
        bloqueoHasta: null,
      },
    );
    return resultado.affected === 1;
  }
}
