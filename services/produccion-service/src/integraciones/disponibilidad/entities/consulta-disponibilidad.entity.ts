import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ESTADO_CONSULTA_DISPONIBILIDAD_PENDIENTE = 'PENDIENTE' as const;
export const ESTADO_CONSULTA_DISPONIBILIDAD_RESPONDIDA = 'RESPONDIDA' as const;

export type EstadoConsultaDisponibilidad =
  | typeof ESTADO_CONSULTA_DISPONIBILIDAD_PENDIENTE
  | typeof ESTADO_CONSULTA_DISPONIBILIDAD_RESPONDIDA;

@Entity('consultas_disponibilidad')
@Index('uq_consultas_disponibilidad_consulta_id', ['consultaId'], { unique: true })
@Index('uq_consultas_disponibilidad_request_event_id', ['requestEventId'], { unique: true })
@Index('uq_consultas_disponibilidad_orden_version', ['ordenId', 'consultaVersion'], { unique: true })
@Index('ix_consultas_disponibilidad_orden_estado', ['ordenId', 'estado', 'consultaVersion'])
export class ConsultaDisponibilidad {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({ name: 'consulta_id', type: 'varchar', length: 100 })
  consultaId: string;

  @Column({ name: 'consulta_version', type: 'integer' })
  consultaVersion: number;

  @Column({ name: 'orden_id', type: 'bigint' })
  ordenId: string;

  @Column({ name: 'request_event_id', type: 'uuid' })
  requestEventId: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId: string;

  @Column({ type: 'varchar', length: 20, default: ESTADO_CONSULTA_DISPONIBILIDAD_PENDIENTE })
  estado: EstadoConsultaDisponibilidad;

  @Column({ name: 'response_event_id', type: 'uuid', nullable: true })
  responseEventId: string | null;

  @Column({ name: 'vigente_en', type: 'timestamptz', nullable: true })
  vigenteEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz', default: () => 'NOW()' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz', default: () => 'NOW()' })
  actualizadoEn: Date;
}
