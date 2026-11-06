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

// ABC-352: chofer normalizado en la copia local del ERP.
// uq_recurso_chofer_snapshot_ext evita duplicación por id externo en un mismo snapshot.
@Entity('recursos_externos_choferes')
@Unique('uq_recurso_chofer_snapshot_ext', ['snapshotId', 'idExterno'])
@Check('ck_recurso_chofer_id', 'LENGTH(BTRIM(id_externo)) > 0')
@Check('ck_recurso_chofer_nombre', 'LENGTH(BTRIM(nombre)) > 0')
export class RecursoExternoChofer {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'snapshot_id', type: 'bigint' })
  snapshotId!: string;

  @ManyToOne(() => RecursoExternoSnapshot, (snapshot) => snapshot.choferes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'snapshot_id' })
  snapshot?: RecursoExternoSnapshot;

  @Index('ix_recursos_choferes_fecha')
  @Column({ type: 'date' })
  fecha!: string;

  @Index('ix_recursos_choferes_id_externo')
  @Column({ name: 'id_externo', type: 'varchar', length: 80 })
  idExterno!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ name: 'licencia_categoria', type: 'varchar', length: 10, nullable: true })
  licenciaCategoria!: string | null;

  @Column({ type: 'boolean' })
  disponible!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
