import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('grupos_salida_solicitudes')
@Index('uq_grupo_solicitud_activa', ['solicitudId'], { unique: true, where: 'liberada_en IS NULL' })
export class GrupoSolicitud {
  @PrimaryColumn({ name: 'grupo_id', type: 'bigint' })
  grupoId!: string;

  @PrimaryColumn({ name: 'solicitud_id', type: 'bigint' })
  solicitudId!: string;

  @Column({ name: 'liberada_en', type: 'timestamptz', nullable: true })
  liberadaEn!: Date | null;
}
