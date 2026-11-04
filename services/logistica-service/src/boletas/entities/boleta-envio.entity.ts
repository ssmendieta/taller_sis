import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { SolicitudSalida } from '../../solicitudes-salida/entities/solicitud-salida.entity';
import { EstadoBoleta } from './estado-boleta.enum';
import { BoletaEnvioItem } from './boleta-envio-item.entity';
import { BoletaEnvioHistorial } from './boleta-envio-historial.entity';

@Entity('boletas_envio')
@Unique('uq_boleta_envio_numero', ['numero'])
@Check('ck_boleta_envio_estado', "estado IN ('BORRADOR','EMITIDA','ANULADA')")
@Check('ck_boleta_envio_responsable', 'responsable_usuario_id > 0')
export class BoletaEnvio {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Index('ix_boletas_envio_solicitud')
  @Column({ name: 'solicitud_salida_id', type: 'bigint' })
  solicitudSalidaId!: string;

  @Column({ type: 'varchar', length: 16 })
  numero!: string;

  @Column({ type: 'varchar', length: 20, default: EstadoBoleta.BORRADOR })
  estado!: EstadoBoleta;

  @Column({ name: 'responsable_usuario_id', type: 'bigint' })
  responsableUsuarioId!: string;

  @OneToMany(() => BoletaEnvioItem, (item) => item.boleta, { cascade: false })
  items!: BoletaEnvioItem[];

  @OneToMany(() => BoletaEnvioHistorial, (historial) => historial.boleta, { cascade: false })
  historial!: BoletaEnvioHistorial[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;

  @ManyToOne(() => SolicitudSalida, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'solicitud_salida_id', foreignKeyConstraintName: 'fk_boleta_envio_solicitud' })
  solicitudSalida!: SolicitudSalida;
}
