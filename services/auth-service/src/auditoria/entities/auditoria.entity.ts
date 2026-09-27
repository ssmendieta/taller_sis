import {Column, Entity, PrimaryGeneratedColumn} from 'typeorm';

@Entity('auditoria')
export class Auditoria {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id!: string;

  @Column('bigint', {nullable: true})
  usuario_actor_id!: string | null;

  @Column('varchar', {length: 120})
  accion!: string;

  @Column('varchar', {length: 120})
  entidad!: string;

  @Column('varchar', {length: 100, nullable: true})
  entidad_id!: string | null;

  @Column('bigint', {nullable: true})
  usuario_afectado_id!: string | null;

  @Column('jsonb', {nullable: true})
  datos_antes!: unknown | null;

  @Column('jsonb', {nullable: true})
  datos_despues!: unknown | null;

  @Column('timestamptz', {default: () => 'NOW()'})
  fecha_hora!: Date;

}
