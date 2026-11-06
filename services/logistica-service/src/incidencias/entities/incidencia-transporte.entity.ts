import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { RutaParada } from '../../rutas/entities/ruta-parada.entity';
import { Ruta } from '../../rutas/entities/ruta.entity';
import { TipoIncidencia } from './tipo-incidencia.enum';

// ABC-380: incidencia de una ruta o de una entrega (parada). Autor y fecha los
// fija el servidor. La migración exige que la parada sea de la misma ruta.
@Entity('incidencias_transporte')
@Unique('uq_incidencia_transporte_id_ruta', ['id', 'rutaId'])
@Check('ck_incidencia_transporte_tipo', "tipo IN ('RETRASO','AVERIA_VEHICULO','CLIENTE_AUSENTE','DIRECCION_INCORRECTA','CARGA_DANADA','OTRO')")
@Check('ck_incidencia_transporte_motivo', 'LENGTH(BTRIM(motivo)) > 0')
@Check('ck_incidencia_transporte_autor', 'registrada_por_usuario_id > 0')
@Index('ix_incidencias_transporte_ruta', ['rutaId', 'registradaEn'])
export class IncidenciaTransporte {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'ruta_id', type: 'bigint' })
  rutaId!: string;

  @ManyToOne(() => Ruta, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ruta_id', foreignKeyConstraintName: 'fk_incidencia_transporte_ruta' })
  ruta!: Ruta;

  // Opcional: null cuando la incidencia es de toda la ruta.
  @Index('ix_incidencias_transporte_parada')
  @Column({ name: 'parada_id', type: 'bigint', nullable: true })
  paradaId!: string | null;

  // La FK real es compuesta (parada_id, ruta_id); se declara en la migración.
  @ManyToOne(() => RutaParada, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'parada_id' })
  parada!: RutaParada | null;

  @Column({ type: 'varchar', length: 30 })
  tipo!: TipoIncidencia;

  @Column({ type: 'varchar', length: 500 })
  motivo!: string;

  @Column({ name: 'registrada_por_usuario_id', type: 'bigint' })
  registradaPorUsuarioId!: string;

  @CreateDateColumn({ name: 'registrada_en', type: 'timestamptz' })
  registradaEn!: Date;
}
