import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SolicitudSalida } from './solicitud-salida.entity';

@Entity('solicitudes_salida_items')
@Check('ck_solicitud_salida_item_cantidad', "cantidad > 0 AND cantidad <> 'NaN'::numeric")
@Check('ck_solicitud_salida_item_referencia', "LENGTH(BTRIM(referencia)) > 0")
export class SolicitudSalidaItem {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'solicitud_id', type: 'bigint' })
  solicitudId!: string;

  @ManyToOne(() => SolicitudSalida, (solicitud) => solicitud.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitud_id', foreignKeyConstraintName: 'fk_solicitud_salida_item_solicitud' })
  solicitud!: SolicitudSalida;

  @Column({ type: 'varchar', length: 160 })
  referencia!: string;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  cantidad!: string;
}
