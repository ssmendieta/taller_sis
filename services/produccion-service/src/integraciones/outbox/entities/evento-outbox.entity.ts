import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PubSubEvent } from '../../pubsub/pubsub.types';

export const ESTADO_OUTBOX_PENDIENTE = 'PENDIENTE' as const;
export const ESTADO_OUTBOX_PROCESANDO = 'PROCESANDO' as const;
export const ESTADO_OUTBOX_PUBLICADO = 'PUBLICADO' as const;

export type EstadoOutbox =
  | typeof ESTADO_OUTBOX_PENDIENTE
  | typeof ESTADO_OUTBOX_PROCESANDO
  | typeof ESTADO_OUTBOX_PUBLICADO;

@Entity('eventos_outbox')
@Index('uq_eventos_outbox_event_id', ['eventId'], { unique: true })
@Index(
  'uq_eventos_outbox_agregado_evento',
  ['aggregateType', 'aggregateId', 'eventType'],
  { unique: true },
)
@Index('ix_eventos_outbox_pendientes', ['estado', 'proximoIntentoEn', 'creadoEn'])
export class EventoOutbox {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 80 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 100 })
  aggregateId: string;

  @Column({ type: 'jsonb' })
  payload: PubSubEvent<unknown>;

  @Column({ type: 'varchar', length: 20, default: ESTADO_OUTBOX_PENDIENTE })
  estado: EstadoOutbox;

  @Column({ type: 'integer', default: 0 })
  intentos: number;

  @Column({ name: 'message_id', type: 'varchar', length: 255, nullable: true })
  messageId: string | null;

  @Column({ name: 'ultimo_error', type: 'text', nullable: true })
  ultimoError: string | null;

  @Column({ name: 'proximo_intento_en', type: 'timestamptz', default: () => 'NOW()' })
  proximoIntentoEn: Date;

  @Column({ name: 'ultimo_intento_en', type: 'timestamptz', nullable: true })
  ultimoIntentoEn: Date | null;

  @Column({ name: 'bloqueo_token', type: 'uuid', nullable: true })
  bloqueoToken: string | null;

  @Column({ name: 'bloqueo_hasta', type: 'timestamptz', nullable: true })
  bloqueoHasta: Date | null;

  @Column({ name: 'publicado_en', type: 'timestamptz', nullable: true })
  publicadoEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz', default: () => 'NOW()' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz', default: () => 'NOW()' })
  actualizadoEn: Date;
}
