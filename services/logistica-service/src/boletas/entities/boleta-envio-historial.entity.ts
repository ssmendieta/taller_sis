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
import { BoletaEnvio } from './boleta-envio.entity';
import { EstadoBoleta } from './estado-boleta.enum';

@Entity('boletas_envio_historial')
@Check('ck_boleta_envio_historial_estado_anterior', "estado_anterior IN ('BORRADOR','EMITIDA','ANULADA')")
@Check('ck_boleta_envio_historial_estado_nuevo', "estado_nuevo IN ('BORRADOR','EMITIDA','ANULADA')")
@Check('ck_boleta_envio_historial_actor', 'usuario_actor_id > 0')
@Check('ck_boleta_envio_historial_motivo', 'LENGTH(BTRIM(motivo)) > 0')
export class BoletaEnvioHistorial {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Index('ix_boletas_envio_historial_boleta')
  @Column({ name: 'boleta_id', type: 'bigint' })
  boletaId!: string;

  @Column({ name: 'estado_anterior', type: 'varchar', length: 20 })
  estadoAnterior!: EstadoBoleta;

  @Column({ name: 'estado_nuevo', type: 'varchar', length: 20 })
  estadoNuevo!: EstadoBoleta;

  @Column({ name: 'usuario_actor_id', type: 'bigint' })
  usuarioActorId!: string;

  @Column({ type: 'varchar', length: 500 })
  motivo!: string;

  @Index('ix_boletas_envio_historial_fecha')
  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz' })
  fechaHora!: Date;

  @ManyToOne(() => BoletaEnvio, (boleta) => boleta.historial, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'boleta_id', foreignKeyConstraintName: 'fk_boleta_envio_historial_boleta' })
  boleta!: BoletaEnvio;

  get creadoEn(): Date {
    return this.fechaHora;
  }

  get usuarioId(): string {
    return this.usuarioActorId;
  }
}
