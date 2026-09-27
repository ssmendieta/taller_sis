import {Entity, PrimaryGeneratedColumn, Column} from 'typeorm';

@Entity('avances_produccion')
export class AvancesProduccion {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({type: 'bigint'})
  orden_id!: string;

  @Column({type: 'numeric', precision: 14, scale: 4})
  cantidad_producida!: number;

  @Column({type: 'timestamptz', default: () => 'NOW()'})
  fecha_hora!: Date;

  @Column({type: 'bigint'})
  usuario_responsable_id!: string;
}