import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BoletaEnvio } from './boleta-envio.entity';

@Entity('boletas_envio_items')
@Check('ck_boleta_envio_item_referencia', 'LENGTH(BTRIM(referencia)) > 0')
@Check('ck_boleta_envio_item_cantidad', "cantidad > 0 AND cantidad <> 'NaN'::numeric")
export class BoletaEnvioItem {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'boleta_id', type: 'bigint' })
  boletaId!: string;

  @ManyToOne(() => BoletaEnvio, (boleta) => boleta.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boleta_id', foreignKeyConstraintName: 'fk_boleta_envio_item_boleta' })
  boleta!: BoletaEnvio;

  @Column({ type: 'varchar', length: 160 })
  referencia!: string;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  cantidad!: string;
}
