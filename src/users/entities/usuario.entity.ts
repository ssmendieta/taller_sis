import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('usuarios')
export class Usuario {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'nombre_completo' })
  nombreCompleto: string;

  @Column({ unique: true })
  correo: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'rol_id' })
  rolId: number;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'eliminado_en', nullable: true })
  eliminadoEn: Date;

}