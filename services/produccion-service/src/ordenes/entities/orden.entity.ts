import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';


@Entity('ordenes_produccion')
export class Orden {


  @PrimaryGeneratedColumn()
  id: number;


  @Column({
    length: 40,
  })
  codigo: string;


  @Column({
    name: 'receta_id',
  })
  recetaId: number;


  @Column({
    name: 'cantidad_solicitada',
    type: 'decimal',
  })
  cantidadSolicitada: number;


  @Column({
    name: 'fecha_programada',
    type: 'date',
  })
  fechaProgramada: Date;


  @Column({
    length: 20,
  })
  estado: string;


  @Column({
    name: 'responsable_usuario_id',
  })
  responsableUsuarioId: number;

}