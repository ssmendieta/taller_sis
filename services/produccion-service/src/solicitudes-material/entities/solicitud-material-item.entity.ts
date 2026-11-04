import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Material } from '../../materiales/entities/material.entity';
import { SolicitudMaterial } from './solicitud-material.entity';

@Entity('solicitud_material_items')
@Check('ck_solicitud_material_item_cantidad', 'cantidad > 0')
@Check('ck_solicitud_material_item_unidad', "unidad IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete')")
export class SolicitudMaterialItem {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Index('ix_solicitud_material_items_solicitud')
  @Column({ name: 'solicitud_id', type: 'bigint' })
  solicitudId: string;

  @ManyToOne(() => SolicitudMaterial, (solicitud) => solicitud.items, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'solicitud_id', foreignKeyConstraintName: 'fk_solicitud_material_item_solicitud' })
  solicitud: SolicitudMaterial;

  @Index('ix_solicitud_material_items_material')
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id', foreignKeyConstraintName: 'fk_solicitud_material_item_material' })
  material: Material;

  // PostgreSQL devuelve NUMERIC como texto; conserva los cuatro decimales.
  @Column({ type: 'numeric', precision: 14, scale: 4 })
  cantidad: string;

  @Column({ type: 'varchar', length: 40 })
  unidad: string;
}
