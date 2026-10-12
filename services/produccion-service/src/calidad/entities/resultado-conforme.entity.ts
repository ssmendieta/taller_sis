import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';

@Entity('resultados_conformes')
@Check('ck_resultado_conforme_cantidad', "cantidad > 0 AND cantidad <> 'NaN'::numeric")
@Check('ck_resultado_conforme_responsable', 'responsable_usuario_id > 0')
export class ResultadoConforme {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Index('ix_resultados_conformes_orden')
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
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_resultado_conforme_orden' })
  orden: OrdenProduccion;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  cantidad: string;

  @Column({ name: 'responsable_usuario_id', type: 'bigint' })
  responsableUsuarioId: string;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz', default: () => 'NOW()' })
  fechaHora: Date;
}
