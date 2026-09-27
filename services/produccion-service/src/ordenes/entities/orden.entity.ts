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


  @Column({
    name: 'iniciada_en',
    type: 'timestamptz',
    nullable: true,
  })
  iniciadaEn: Date;


  @Column({
    name: 'finalizada_en',
    type: 'timestamptz',
    nullable: true,
  })
  finalizadaEn: Date;


  @Column({
    name: 'cancelada_en',
    type: 'timestamptz',
    nullable: true,
  })
  canceladaEn: Date;


  @Column({
    name: 'creado_en',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  creadoEn: Date;


  @Column({
    name: 'actualizado_en',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  actualizadoEn: Date;

}