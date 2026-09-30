import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('sesiones')
export class Sesion {
  @PrimaryColumn('text')
  jti!: string;

  @Column({ type: 'bigint', name: 'usuario_id' })
  usuario_id!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()', name: 'emitida_en' })
  emitida_en!: Date;

  @Column({
    type: 'timestamptz',
    default: () => 'NOW()',
    name: 'ultima_actividad',
  })
  ultima_actividad!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'revocada_en' })
  revocada_en!: Date | null;
}
