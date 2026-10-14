import { EventoOutbox } from './entities/evento-outbox.entity';

export const OUTBOX_STORE = Symbol('OUTBOX_STORE');

export interface ReclamarEventosOptions {
  ahora: Date;
  limite: number;
  leaseMs: number;
}

export interface OutboxStore {
  reclamarPendientes(options: ReclamarEventosOptions): Promise<EventoOutbox[]>;
  marcarPublicado(
    evento: EventoOutbox,
    messageId: string,
    publicadoEn: Date,
  ): Promise<void>;
  marcarFallo(
    evento: EventoOutbox,
    error: string,
    proximoIntentoEn: Date,
  ): Promise<void>;
}
