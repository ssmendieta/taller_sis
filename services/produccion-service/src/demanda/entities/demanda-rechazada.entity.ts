import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type MotivoRechazoDemanda = 'EVENTO_INVALIDO' | 'EVENTO_CONTRADICTORIO' | 'DEMANDA_CONTRADICTORIA';

// ABC-357: traza de mensajes de demanda rechazados de forma permanente.
@Entity('demandas_rechazadas')
@Index('uq_demanda_rechazada_event_id', ['eventId'], { unique: true, where: 'event_id IS NOT NULL' })
export class DemandaRechazada {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  origen: string | null;

  @Column({ name: 'demanda_externa_id', type: 'varchar', length: 80, nullable: true })
  demandaExternaId: string | null;

  @Column({ type: 'varchar', length: 40 })
  motivo: MotivoRechazoDemanda;

  @Column({ type: 'varchar', length: 1000 })
  detalle: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: unknown;

  @Column({ name: 'message_id', type: 'varchar', length: 255, nullable: true })
  messageId: string | null;

  @CreateDateColumn({ name: 'recibido_en', type: 'timestamptz', default: () => 'NOW()' })
  recibidoEn: Date;
}
