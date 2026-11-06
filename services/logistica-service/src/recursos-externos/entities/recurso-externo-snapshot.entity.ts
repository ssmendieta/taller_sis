import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RecursoExternoVehiculo } from './recurso-externo-vehiculo.entity';
import { RecursoExternoChofer } from './recurso-externo-chofer.entity';
import { RespuestaRecursosErpV1 } from '../dto/recursos-logisticos-v1';

// ABC-352: snapshot persistido de la respuesta del ERP para una fecha dada.
// Conserva la versión del contrato, fecha de sincronización y los datos íntegros.
@Entity('recursos_externos_snapshots')
export class RecursoExternoSnapshot {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Index('ix_recursos_snapshot_fecha', { unique: true })
  @Column({ type: 'date', unique: true })
  fecha!: string;

  @Column({ type: 'varchar', length: 50 })
  version!: string;

  @Column({ name: 'generado_en', type: 'timestamptz' })
  generadoEn!: Date;

  @Index('ix_recursos_snapshot_sincronizado_en')
  @Column({ name: 'sincronizado_en', type: 'timestamptz' })
  sincronizadoEn!: Date;

  @Column({ type: 'jsonb' })
  datos!: RespuestaRecursosErpV1;

  @OneToMany(() => RecursoExternoVehiculo, (vehiculo) => vehiculo.snapshot, {
    cascade: true,
  })
  vehiculos?: RecursoExternoVehiculo[];

  @OneToMany(() => RecursoExternoChofer, (chofer) => chofer.snapshot, {
    cascade: true,
  })
  choferes?: RecursoExternoChofer[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
