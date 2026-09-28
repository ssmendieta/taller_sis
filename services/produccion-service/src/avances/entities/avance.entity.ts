import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';


@Entity('avances_produccion')
export class Avance {


  @PrimaryGeneratedColumn()
  id: number;


  @Column()
  orden_id: number;


  @Column({
    type: 'numeric',
    precision: 14,
    scale: 4,
  })
  cantidad_producida: number;


  @Column({
    type: 'timestamp with time zone',
    default: () => 'now()',
  })
  fecha_hora: Date;


  @Column()
  usuario_responsable_id: number;


}