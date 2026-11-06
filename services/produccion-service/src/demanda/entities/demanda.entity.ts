import { Check, Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { DemandaItem } from './demanda-item.entity';

export const ORIGENES_DEMANDA = ['VENTAS', 'FACTURACION'] as const;
export type OrigenDemanda = typeof ORIGENES_DEMANDA[number];
export const ESTADO_DEMANDA_RECIBIDA = 'RECIBIDA' as const;
export const ESTADO_DEMANDA_CONFIRMADA = 'CONFIRMADA' as const;
export const ESTADOS_DEMANDA = [ESTADO_DEMANDA_RECIBIDA, ESTADO_DEMANDA_CONFIRMADA] as const;
export type EstadoDemanda = typeof ESTADOS_DEMANDA[number];

// ABC-355: demanda externa recibida de Ventas o Facturación. No crea órdenes.
// ABC-364 (ABC-130): la confirmación actualiza la misma demanda a CONFIRMADA con su fecha y correlación.
@Entity('demandas')
@Unique('uq_demanda_origen_externa', ['origen', 'demandaExternaId'])
@Check('ck_demanda_origen', "origen IN ('VENTAS','FACTURACION')")
@Check('ck_demanda_estado', "estado IN ('RECIBIDA', 'CONFIRMADA')")
@Check('ck_demanda_externa_id', 'LENGTH(BTRIM(demanda_externa_id)) > 0')
export class Demanda {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  origen: OrigenDemanda;

  @Column({ name: 'demanda_externa_id', type: 'varchar', length: 80 })
  demandaExternaId: string;

  @Column({ name: 'fecha_requerida', type: 'date' })
  fechaRequerida: string;

  @Column({ type: 'varchar', length: 20, default: ESTADO_DEMANDA_RECIBIDA })
  estado: EstadoDemanda;

  // Evento que la creó y huella de su contenido de negocio, para detectar contradicciones.
  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId: string;

  @Column({ name: 'contenido_hash', type: 'char', length: 64 })
  contenidoHash: string;

  @OneToMany(() => DemandaItem, (item) => item.demanda, { cascade: false })
  items: DemandaItem[];

  @CreateDateColumn({ name: 'recibida_en', type: 'timestamptz', default: () => 'NOW()' })
  recibidaEn: Date;

  // ABC-364 (ABC-130): fecha y correlación del evento que confirmó la demanda.
  @Column({ name: 'confirmada_en', type: 'timestamptz', nullable: true })
  confirmadaEn: Date | null;

  @Column({ name: 'confirmacion_event_id', type: 'uuid', nullable: true })
  confirmacionEventId: string | null;

  @Column({ name: 'confirmacion_correlation_id', type: 'uuid', nullable: true })
  confirmacionCorrelationId: string | null;
}
