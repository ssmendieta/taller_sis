import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre_completo!: string;

  @Column({ type: 'varchar', length: 255 })
  correo!: string;

  @Column({ type: 'text', select: false })
  password_hash!: string;

  @Column({ type: 'bigint' })
  rol_id!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  eliminado_en!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  creado_en!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizado_en!: Date;
}
