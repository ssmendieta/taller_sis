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


  // ABC-345: precio de referencia interno en BOB (4 decimales); null = sin precio.
  @Column({
    name: 'costo_unitario',
    type: 'numeric',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  costoUnitario: string | null;


  @Column({
    name: 'moneda_costo',
    type: 'varchar',
    length: 3,
    default: 'BOB',
  })
  monedaCosto: string;


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