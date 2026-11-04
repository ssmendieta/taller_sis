import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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
