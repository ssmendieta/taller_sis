import { EventoOutbox } from './entities/evento-outbox.entity';

export const OUTBOX_STORE = Symbol('OUTBOX_STORE');

export interface ReclamarEventosOptions {
  ahora: Date;
  limite: number;
  leaseMs: number;
}

export interface OutboxStore {
  reclamarPendientes(options: ReclamarEventosOptions): Promise<EventoOutbox[]>;
  // Devuelve false cuando el lease ya pertenece a otro worker y la escritura
  // condicional no modificó el evento.
  marcarPublicado(
    evento: EventoOutbox,
    messageId: string,
    publicadoEn: Date,
  ): Promise<boolean>;
  // Igual que marcarPublicado: false identifica un resultado tardío que debe
  // diagnosticarse sin alterar al propietario actual del evento.
  marcarFallo(
    evento: EventoOutbox,
    error: string,
    proximoIntentoEn: Date,
  ): Promise<boolean>;
}
