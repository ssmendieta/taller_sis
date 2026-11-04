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
import { SolicitudSalidaItem } from './solicitud-salida-item.entity';

@Entity('solicitudes_salida')
@Check('ck_solicitud_salida_destino', "LENGTH(BTRIM(destino_documental)) > 0")
@Check('ck_solicitud_salida_estado', "estado IN ('BORRADOR','PREPARADA')")
@Check('ck_solicitud_salida_responsable', 'responsable_usuario_id > 0')
export class SolicitudSalida {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Index('ix_solicitudes_salida_orden')
  @Column({ name: 'orden_id', type: 'bigint' })
  ordenId!: string;

  @Column({ name: 'destino_documental', type: 'varchar', length: 250 })
  destinoDocumental!: string;

  @Column({ type: 'varchar', length: 500 })
  motivo!: string;

  @Column({ name: 'responsable_usuario_id', type: 'bigint' })
  responsableUsuarioId!: string;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado!: 'BORRADOR' | 'PREPARADA';

  @OneToMany(() => SolicitudSalidaItem, (item) => item.solicitud, { cascade: false })
  items!: SolicitudSalidaItem[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
