import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { RecursoExternoSnapshot } from './recurso-externo-snapshot.entity';

// ABC-352: vehículo normalizado en la copia local del ERP.
// uq_recurso_vehiculo_snapshot_ext evita duplicación por id externo en un mismo snapshot.
@Entity('recursos_externos_vehiculos')
@Unique('uq_recurso_vehiculo_snapshot_ext', ['snapshotId', 'idExterno'])
@Check('ck_recurso_vehiculo_id', 'LENGTH(BTRIM(id_externo)) > 0')
@Check('ck_recurso_vehiculo_placa', 'LENGTH(BTRIM(placa)) > 0')
export class RecursoExternoVehiculo {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'snapshot_id', type: 'bigint' })
  snapshotId!: string;

  @ManyToOne(() => RecursoExternoSnapshot, (snapshot) => snapshot.vehiculos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'snapshot_id' })
  snapshot?: RecursoExternoSnapshot;

  @Index('ix_recursos_vehiculos_fecha')
  @Column({ type: 'date' })
  fecha!: string;

  @Index('ix_recursos_vehiculos_id_externo')
  @Column({ name: 'id_externo', type: 'varchar', length: 80 })
  idExterno!: string;

  @Column({ type: 'varchar', length: 20 })
  placa!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  descripcion!: string | null;

  @Column({ name: 'capacidad_valor', type: 'numeric', precision: 14, scale: 4 })
  capacidadValor!: string;

  @Column({ name: 'capacidad_unidad', type: 'varchar', length: 20 })
  capacidadUnidad!: string;

  @Column({ type: 'boolean' })
  disponible!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
