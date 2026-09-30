import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RecetaMaterial } from './receta-material.entity';


@Entity('recetas')
@Index('ux_receta_producto_activa', ['productoCodigo'], {
  unique: true,
  where: 'activa = TRUE',
})
export class Receta {
  @PrimaryGeneratedColumn('identity')
  id: number;

  @Column({
    name: 'producto_codigo',
    length: 80,
  })
  productoCodigo: string;

  @Column({
    name: 'producto_nombre',
    length: 150,
  })
  productoNombre: string;

  @Column({
    name: 'unidad_producto',
    length: 20,
    default: 'unidad',
  })
  unidadProducto: string;

  @Column({
    default: true,
  })
  activa: boolean;

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

  @OneToMany(() => RecetaMaterial, (item) => item.receta)
  items: RecetaMaterial[];
}
