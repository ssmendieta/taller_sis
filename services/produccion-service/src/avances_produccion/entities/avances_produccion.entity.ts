import {Entity, PrimaryGeneratedColumn, Column} from 'typeorm';

@Entity('avances_produccion')
export class AvancesProduccion {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id!: string;

  @Column({type: 'bigint'})
  orden_id!: string;

  @Column({type: 'numeric', precision: 14, scale: 4})
  cantidad_producida!: number;

  @Column({type: 'timestamptz', default: () => 'NOW()'})
  fecha_hora!: Date;

  @Column({type: 'bigint'})
  usuario_responsable_id!: string;

  @Column({type: 'varchar', length: 150, nullable: true, name: 'usuario_responsable_nombre'})
  usuario_responsable_nombre!: string | null;
}
