import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('usuarios')
export class UserEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'nombre_completo', length: 150 })
  nombreCompleto: string;

  @Column({ length: 255, unique: true })
  correo: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ name: 'rol_id', type: 'bigint' })
  rolId: number;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'eliminado_en', type: 'timestamptz', nullable: true })
  eliminadoEn: Date | null;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'NOW()' })
  creadoEn: Date;

  @Column({ name: 'actualizado_en', type: 'timestamptz', default: () => 'NOW()' })
  actualizadoEn: Date;
}