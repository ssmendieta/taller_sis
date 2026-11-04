import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';
import { SolicitudMaterialItem } from './solicitud-material-item.entity';

@Entity('solicitudes_material')
export class SolicitudMaterial {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Index('ix_solicitudes_material_orden')
  @Column({ name: 'orden_id', type: 'bigint' })
  ordenId: string;

  @ManyToOne(() => OrdenProduccion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_solicitud_material_orden' })
  orden: OrdenProduccion;

  @Column({ name: 'solicitante_usuario_id', type: 'bigint' })
  solicitanteUsuarioId: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'NOW()' })
  fecha: Date;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: string;

  @Column({ name: 'solicitud_version', type: 'integer', default: 1 })
  solicitudVersion: number;

  @Column({ name: 'estado_actualizado_en', type: 'timestamptz', nullable: true })
  estadoActualizadoEn: Date | null;

  @Column({ name: 'motivo_estado', type: 'varchar', length: 500, nullable: true })
  motivoEstado: string | null;

  @OneToMany(() => SolicitudMaterialItem, (item) => item.solicitud)
  items: SolicitudMaterialItem[];
}
