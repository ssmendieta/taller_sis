import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EstadoRuta } from './estado-ruta.enum';
import { RutaParada } from './ruta-parada.entity';

// Vehículo y chofer pertenecen al ERP (ABC-115): se guardan sus identificadores
// externos sin clave foránea, porque esa base no es de Logística.
@Entity('rutas')
@Check('ck_ruta_estado', "estado IN ('PLANIFICADA','DESPACHADA','COMPLETADA','CANCELADA')")
@Check('ck_ruta_vehiculo', 'LENGTH(BTRIM(vehiculo_externo_id)) > 0')
@Check('ck_ruta_chofer', 'LENGTH(BTRIM(chofer_externo_id)) > 0')
@Check('ck_ruta_grupo', 'grupo_id IS NULL OR grupo_id > 0')
@Check('ck_ruta_responsable', 'responsable_usuario_id > 0')
@Check('ck_ruta_despacho_autor', '(despachada_en IS NULL AND despachada_por_usuario_id IS NULL) OR (despachada_en IS NOT NULL AND despachada_por_usuario_id > 0)')
@Check('ck_ruta_despacho_estado', "estado NOT IN ('DESPACHADA','COMPLETADA') OR despachada_en IS NOT NULL")
@Check('ck_ruta_completada_fecha', "(estado = 'COMPLETADA') = (completada_en IS NOT NULL)")
@Check('ck_ruta_despacho_observacion', 'despacho_observacion IS NULL OR (despachada_en IS NOT NULL AND LENGTH(BTRIM(despacho_observacion)) > 0)')
export class Ruta {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  // Grupo de solicitudes de ABC-362; su tabla todavía no existe, por eso no hay FK.
  @Index('ix_rutas_grupo')
  @Column({ name: 'grupo_id', type: 'bigint', nullable: true })
  grupoId!: string | null;

  @Index('ix_rutas_fecha_programada')
  @Column({ name: 'fecha_programada', type: 'date' })
  fechaProgramada!: string;

  @Column({ name: 'vehiculo_externo_id', type: 'varchar', length: 80 })
  vehiculoExternoId!: string;

  @Column({ name: 'chofer_externo_id', type: 'varchar', length: 80 })
  choferExternoId!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoRuta.PLANIFICADA })
  estado!: EstadoRuta;

  @Column({ name: 'responsable_usuario_id', type: 'bigint' })
  responsableUsuarioId!: string;

  @Column({ name: 'despachada_en', type: 'timestamptz', nullable: true })
  despachadaEn!: Date | null;

  @Column({ name: 'despachada_por_usuario_id', type: 'bigint', nullable: true })
  despachadaPorUsuarioId!: string | null;

  @Column({ name: 'despacho_observacion', type: 'varchar', length: 500, nullable: true })
  despachoObservacion!: string | null;

  @Column({ name: 'completada_en', type: 'timestamptz', nullable: true })
  completadaEn!: Date | null;

  @OneToMany(() => RutaParada, (parada) => parada.ruta, { cascade: false })
  paradas!: RutaParada[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
