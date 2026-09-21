import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nombre_completo', length: 150 })
  nombreCompleto: string;

  @Column({ unique: true, length: 255 })
  correo: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ name: 'rol_id' })
  rolId: number;

  @Column({ default: true })
  activo: boolean;

  @Column({
    name: 'eliminado_en',
    type: 'timestamp',
    nullable: true,
  })
  eliminadoEn: Date | null;

  @Column({
    name: 'creado_en',
    type: 'timestamp',
    default: () => 'NOW()',
  })
  creadoEn: Date;

  @Column({
    name: 'actualizado_en',
    type: 'timestamp',
    default: () => 'NOW()',
  })
  actualizadoEn: Date;
}