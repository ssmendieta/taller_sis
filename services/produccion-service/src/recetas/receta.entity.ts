import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('recetas')
export class Receta {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'id',
  })
  id: string;

  @Column({
    name: 'producto_codigo',
    type: 'varchar',
    length: 80,
  })
  productoCodigo: string;

  @Column({
    name: 'producto_nombre',
    type: 'varchar',
    length: 150,
  })
  productoNombre: string;

  @Column({
    name: 'activa',
    type: 'boolean',
    default: true,
  })
  activa: boolean;

  @Column({
    name: 'creado_en',
    type: 'timestamptz',
  })
  creadoEn: Date;

  @Column({
    name: 'actualizado_en',
    type: 'timestamptz',
  })
  actualizadoEn: Date;
}