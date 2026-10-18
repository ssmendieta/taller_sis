import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Material } from '../../materiales/entities/material.entity';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';

@Entity('consumos_material')
@Check('ck_consumo_material_cantidad', "cantidad > 0 AND cantidad <> 'NaN'::numeric")
@Check('ck_consumo_material_unidad', "unidad IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete')")
@Check('ck_consumo_material_usuario', 'usuario_registro_id > 0')
export class ConsumoMaterial {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Index('ix_consumos_material_orden')
  @Column({ name: 'orden_id', type: 'bigint' })
  ordenId: string;

  @ManyToOne(() => OrdenProduccion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_consumo_material_orden' })
  orden: OrdenProduccion;

  @Index('ix_consumos_material_material')
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id', foreignKeyConstraintName: 'fk_consumo_material_material' })
  material: Material;

  // PostgreSQL devuelve NUMERIC como texto para conservar la precision.
  @Column({ type: 'numeric', precision: 14, scale: 4 })
  cantidad: string;

  @Column({ type: 'varchar', length: 40 })
  unidad: string;

  // El usuario pertenece a Auth; no hay clave foranea entre bases de datos.
  @Column({ name: 'usuario_registro_id', type: 'bigint' })
  usuarioRegistroId: string;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz', default: () => 'NOW()' })
  fechaHora: Date;
}
