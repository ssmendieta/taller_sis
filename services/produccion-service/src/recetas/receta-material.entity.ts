import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Receta } from './receta.entity';

@Entity('receta_material')
export class RecetaMaterial {
  @PrimaryColumn({
    name: 'receta_id',
    type: 'bigint',
  })
  recetaId: string;

  @PrimaryColumn({
    name: 'material_id',
    type: 'bigint',
  })
  materialId: string;

  @Column({
    name: 'cantidad_requerida',
    type: 'decimal',
    precision: 14,
    scale: 4,
  })
  cantidadRequerida: number;

  @ManyToOne(() => Receta)
  @JoinColumn({
    name: 'receta_id',
    referencedColumnName: 'id',
  })
  receta: Receta;
}