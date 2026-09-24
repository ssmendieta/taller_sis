import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';


@Entity('materiales')
export class Material {

  @PrimaryGeneratedColumn()
  id: number;


  @Column({
    unique: true,
    length: 80,
  })
  codigo: string;


  @Column({
    length: 150,
  })
  nombre: string;


  @Column({
    name: 'unidad_medida',
    length: 40,
  })
  unidadMedida: string;


  @Column({
    default: true,
  })
  activo: boolean;


  @Column({
    name: 'creado_en',
    type: 'timestamp',
    default: () => 'NOW()',
  })
  creadoEn: Date;


  @Column({
    name: 'actualizado_en',
    type: 'timestamp',
    default: () => 'NOW()',
  })
  actualizadoEn: Date;

}