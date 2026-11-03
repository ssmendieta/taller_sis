import { Check, Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { DemandaItem } from './demanda-item.entity';

export const ORIGENES_DEMANDA = ['VENTAS', 'FACTURACION'] as const;
export type OrigenDemanda = typeof ORIGENES_DEMANDA[number];
export const ESTADO_DEMANDA_RECIBIDA = 'RECIBIDA' as const;
// ABC-130 agregará CONFIRMADA sobre esta misma tabla.
export type EstadoDemanda = typeof ESTADO_DEMANDA_RECIBIDA;

// ABC-355: demanda externa recibida de Ventas o Facturación. No crea órdenes.
@Entity('demandas')
@Unique('uq_demanda_origen_externa', ['origen', 'demandaExternaId'])
@Check('ck_demanda_origen', "origen IN ('VENTAS','FACTURACION')")
@Check('ck_demanda_estado', "estado IN ('RECIBIDA')")
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
}
