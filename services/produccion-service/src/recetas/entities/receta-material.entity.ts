import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Receta } from './receta.entity';
import { Material } from '../../materiales/entities/material.entity';

// NUMERIC(14,4) llega desde pg como string; se convierte a number al leer.
const numericTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null | undefined) =>
    value === null || value === undefined ? value : parseFloat(value),
};


@Entity('receta_material')
export class RecetaMaterial {
  @PrimaryColumn({
    name: 'receta_id',
    type: 'bigint',
  })
  recetaId: number;

  @PrimaryColumn({
    name: 'material_id',
    type: 'bigint',
  })
  materialId: number;

  @Column({
    name: 'cantidad_requerida',
    type: 'decimal',
    precision: 14,
    scale: 4,
    transformer: numericTransformer,
  })
  cantidadRequerida: number;

  @ManyToOne(() => Receta, (receta) => receta.items, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'receta_id',
    referencedColumnName: 'id',
  })
  receta: Receta;

  @ManyToOne(() => Material, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'material_id',
    referencedColumnName: 'id',
  })
  material: Material;
}
