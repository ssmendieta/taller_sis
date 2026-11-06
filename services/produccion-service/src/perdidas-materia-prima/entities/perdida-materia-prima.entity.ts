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

// ABC-74: merma de materia prima de una orden. Tabla propia: no comparte datos con
// los resultados conformes/defectuosos de calidad ni modifica existencias externas.
@Entity('perdidas_materia_prima')
@Check('ck_perdida_mp_cantidad', "cantidad > 0 AND cantidad <> 'NaN'::numeric")
@Check('ck_perdida_mp_unidad', "unidad IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete')")
@Check('ck_perdida_mp_motivo', 'LENGTH(BTRIM(motivo)) > 0')
@Check('ck_perdida_mp_autor', 'autor_usuario_id > 0')
export class PerdidaMateriaPrima {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Index('ix_perdidas_mp_orden')
  @Column({ name: 'orden_id', type: 'bigint' })
  ordenId: string;

  @ManyToOne(() => OrdenProduccion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_perdida_mp_orden' })
  orden: OrdenProduccion;

  @Index('ix_perdidas_mp_material')
  @Column({ name: 'material_id', type: 'bigint' })
  materialId: string;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id', foreignKeyConstraintName: 'fk_perdida_mp_material' })
  material: Material;

  // PostgreSQL devuelve NUMERIC como texto para conservar la precision.
  @Column({ type: 'numeric', precision: 14, scale: 4 })
  cantidad: string;

  @Column({ type: 'varchar', length: 40 })
  unidad: string;

  @Column({ type: 'varchar', length: 500 })
  motivo: string;

  // El autor pertenece a Auth y se toma de la sesion; no hay clave foranea entre bases.
  @Column({ name: 'autor_usuario_id', type: 'bigint' })
  autorUsuarioId: string;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz', default: () => 'NOW()' })
  fechaHora: Date;
}
