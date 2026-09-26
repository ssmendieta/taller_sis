import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';

const bigintNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) =>
    value === null || value === undefined ? value : Number(value),
};

@Entity({ name: 'usuarios' })
export class Usuario {
  @PrimaryColumn({
    type: 'bigint',
    generated: 'identity',
    transformer: bigintNumber,
  })
  id: number;

  @Column({ name: 'nombre_completo', type: 'varchar', length: 150 })
  nombre_completo: string;

  @Column({ type: 'varchar', length: 255 })
  correo: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  password_hash: string;

  // FK a roles(id). Sin relación ORM: solo la columna, no hay Entity de Rol.
  @Column({ name: 'rol_id', type: 'bigint', transformer: bigintNumber })
  rol_id: number;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ name: 'eliminado_en', type: 'timestamptz', nullable: true })
  eliminado_en: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creado_en: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizado_en: Date;
}
