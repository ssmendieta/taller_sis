import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Demanda } from '../../demanda/entities/demanda.entity';

@Entity('ordenes_produccion')
export class OrdenProduccion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  codigo: string;

  @Column({ name: 'receta_id', type: 'int' })
  producto_id: number;

  @Column({ name: 'cantidad_solicitada', type: 'decimal', precision: 10, scale: 2 })
  cantidad: number;

  @Column({ type: 'date' })
  fecha_programada: string;

  @Column({ type: 'varchar', length: 50, default: 'PENDIENTE' })
  estado: string;

  @Column({ name: 'responsable_usuario_id', type: 'int' })
  responsable_id: number;

  @Column({ name: 'responsable_nombre', type: 'varchar', length: 150, nullable: true })
  responsable_nombre: string | null;

  // ABC-443 (ABC-412): demanda origen cuando la orden nace desde planificación de demanda.
  @Index('ix_ordenes_demanda')
  @Column({
    name: 'demanda_id',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: string | null | undefined) => value,
      from: (value: string | number | null | undefined) => (value == null ? value : String(value)),
    },
  })
  demanda_id: string | null;

  @ManyToOne(() => Demanda, (demanda) => demanda.ordenes, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'demanda_id', foreignKeyConstraintName: 'fk_orden_demanda' })
  demanda?: Demanda | null;

  @Column({ type: 'timestamptz', nullable: true })
  iniciada_en: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finalizada_en: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cancelada_en: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  creado_en: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizado_en: Date;
}
