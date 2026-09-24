import {Column, Entity, PrimaryGeneratedColumn} from 'typeorm';

@Entity('auditoria')
export class Auditoria {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id!: string;

  @Column('bigint', {nullable: true})
  usuario_id!: string | null;

  @Column('varchar', {length: 255})
  accion!: string;

  @Column('varchar', {length: 255})
  entidad!: string;

  @Column('varchar', {length: 255, nullable: true})
  entidad_id!: string;

  @Column('bigint', {nullable: true})
  usuarios_afectados_id!: string | null;

  @Column('jsonb', {nullable: true})
  datos_antes!: unknown | null;

  @Column('jsonb', {nullable: true})
  datos_despues!: unknown | null;

  @Column('timestamptz', {default: () => 'NOW()'})
  creado_en!: Date;

}