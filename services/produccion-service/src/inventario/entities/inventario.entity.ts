import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';


@Entity('inventario_material')
export class Inventario {


  @PrimaryGeneratedColumn()
  id: number;


  @Column({
    name: 'material_id',
  })
  materialId: number;


  @Column({
    name: 'cantidad_disponible',
    type: 'decimal',
  })
  cantidadDisponible: number;


  @Column({
    name: 'actualizado_en',
    type: 'timestamp',
  })
  actualizadoEn: Date;

}