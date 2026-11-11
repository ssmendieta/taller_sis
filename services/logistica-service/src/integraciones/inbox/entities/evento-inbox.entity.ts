import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export const ESTADO_INBOX_PROCESADO = 'PROCESADO' as const;
export const ESTADO_INBOX_IGNORADO = 'IGNORADO' as const;
export type EstadoInbox = typeof ESTADO_INBOX_PROCESADO | typeof ESTADO_INBOX_IGNORADO;

// ABC-387: mensajes recibidos por Logística; el eventId único evita aplicar dos veces.
@Entity('eventos_inbox')
@Index('uq_eventos_inbox_event_id', ['eventId'], { unique: true })
@Index('ix_eventos_inbox_correlacion', ['correlationId', 'recibidoEn'])
export class EventoInbox {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType!: string;

  @Column({ name: 'payload_hash', type: 'char', length: 64 })
  payloadHash!: string;

  @Column({ type: 'jsonb' })
  payload!: unknown;

  @Column({ type: 'varchar', length: 20 })
  estado!: EstadoInbox;

  @Column({ name: 'message_id', type: 'varchar', length: 255, nullable: true })
  messageId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  detalle!: string | null;

  @CreateDateColumn({ name: 'recibido_en', type: 'timestamptz', default: () => 'NOW()' })
  recibidoEn!: Date;
}
