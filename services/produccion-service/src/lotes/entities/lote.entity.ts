import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';

@Entity('lotes')
@Unique('uq_lotes_codigo', ['codigo'])
@Check('ck_lote_codigo', 'codigo = BTRIM(codigo) AND LENGTH(codigo) > 0')
@Check('ck_lote_cantidad', "cantidad > 0 AND cantidad <> 'NaN'::numeric")
@Check('ck_lote_responsable', 'responsable_usuario_id > 0')
export class Lote {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ type: 'varchar', length: 80 })
  codigo: string;

  @Index('ix_lotes_orden')
  @Column({
    name: 'orden_id',
    type: 'bigint',
    transformer: {
      to: (value: string | null | undefined) => value,
      from: (value: string | number | null | undefined) => value == null ? value : String(value),
    },
  })
  ordenId: string;

  @ManyToOne(() => OrdenProduccion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_lote_orden' })
  orden: OrdenProduccion;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  cantidad: string;

  @Column({ name: 'responsable_usuario_id', type: 'bigint' })
  responsableUsuarioId: string;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz', default: () => 'NOW()' })
  fechaHora: Date;
}
