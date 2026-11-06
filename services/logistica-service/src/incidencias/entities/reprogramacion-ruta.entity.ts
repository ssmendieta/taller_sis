import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Ruta } from '../../rutas/entities/ruta.entity';
import { IncidenciaTransporte } from './incidencia-transporte.entity';

// ABC-380: cada cambio de rutas.fecha_programada queda como una fila que no se
// modifica. La fecha original es la fecha_anterior de la primera fila.
@Entity('rutas_reprogramaciones')
@Check('ck_ruta_reprogramacion_fechas', 'fecha_nueva <> fecha_anterior')
@Check('ck_ruta_reprogramacion_motivo', 'LENGTH(BTRIM(motivo)) > 0')
@Check('ck_ruta_reprogramacion_autor', 'registrada_por_usuario_id > 0')
@Index('ix_rutas_reprogramaciones_ruta', ['rutaId', 'id'])
export class ReprogramacionRuta {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'ruta_id', type: 'bigint' })
  rutaId!: string;

  @ManyToOne(() => Ruta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ruta_id', foreignKeyConstraintName: 'fk_ruta_reprogramacion_ruta' })
  ruta!: Ruta;

  // Incidencia que motivó el cambio, de la misma ruta (FK compuesta en la migración).
  @Index('ix_rutas_reprogramaciones_incidencia')
  @Column({ name: 'incidencia_id', type: 'bigint', nullable: true })
  incidenciaId!: string | null;

  @ManyToOne(() => IncidenciaTransporte, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'incidencia_id' })
  incidencia!: IncidenciaTransporte | null;

  @Column({ name: 'fecha_anterior', type: 'date' })
  fechaAnterior!: string;

  @Column({ name: 'fecha_nueva', type: 'date' })
  fechaNueva!: string;

  @Column({ type: 'varchar', length: 500 })
  motivo!: string;

  @Column({ name: 'registrada_por_usuario_id', type: 'bigint' })
  registradaPorUsuarioId!: string;

  @CreateDateColumn({ name: 'registrada_en', type: 'timestamptz' })
  registradaEn!: Date;
}
