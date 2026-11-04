import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { ConsumoCierreV1, ProduccionCerradaV1Data } from '../../integraciones/contratos/contabilidad-v1';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';

export const ESTADO_CONTABLE_PENDIENTE = 'PENDIENTE' as const;
export const ESTADO_CONTABLE_RECIBIDO = 'RECIBIDO' as const;
export const ESTADO_CONTABLE_RECHAZADO = 'RECHAZADO' as const;
export type EstadoContableCierre = typeof ESTADO_CONTABLE_PENDIENTE
  | typeof ESTADO_CONTABLE_RECIBIDO | typeof ESTADO_CONTABLE_RECHAZADO;

@Entity('cierres_produccion')
@Unique('uq_cierres_produccion_orden_version', ['ordenId', 'cierreVersion'])
@Check('ck_cierre_produccion_version', 'cierre_version > 0')
@Check('ck_cierre_produccion_cantidades', `
  cantidad_solicitada > 0 AND cantidad_solicitada <> 'NaN'::numeric AND
  cantidad_producida >= 0 AND cantidad_producida <> 'NaN'::numeric AND
  cantidad_conforme >= 0 AND cantidad_conforme <> 'NaN'::numeric AND
  cantidad_defectuosa >= 0 AND cantidad_defectuosa <> 'NaN'::numeric
`)
@Check('ck_cierre_produccion_clasificado', 'cantidad_conforme + cantidad_defectuosa <= cantidad_producida')
@Check('ck_cierre_produccion_consumos', "jsonb_typeof(consumos) = 'array'")
@Check('ck_cierre_produccion_producto', "jsonb_typeof(producto) = 'object'")
export class CierreProduccion {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({
    name: 'orden_id', type: 'bigint',
    transformer: {
      to: (value: string | null | undefined) => value,
      from: (value: string | number | null | undefined) => value == null ? value : String(value),
    },
  })
  ordenId: string;

  @ManyToOne(() => OrdenProduccion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_cierre_produccion_orden' })
  orden: OrdenProduccion;

  @Column({ name: 'cierre_version', type: 'integer', default: 1 })
  cierreVersion: number;

  @Column({ name: 'orden_codigo', type: 'varchar', length: 50 })
  ordenCodigo: string;

  @Column({ type: 'jsonb' })
  producto: ProduccionCerradaV1Data['producto'];

  @Column({ name: 'cantidad_solicitada', type: 'numeric', precision: 14, scale: 4 })
  cantidadSolicitada: string;

  @Column({ name: 'cantidad_producida', type: 'numeric', precision: 14, scale: 4 })
  cantidadProducida: string;

  @Column({ name: 'cantidad_conforme', type: 'numeric', precision: 14, scale: 4 })
  cantidadConforme: string;

  @Column({ name: 'cantidad_defectuosa', type: 'numeric', precision: 14, scale: 4 })
  cantidadDefectuosa: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  consumos: ConsumoCierreV1[];

  @Column({ name: 'finalizada_at', type: 'timestamptz' })
  finalizadaAt: Date;

  @CreateDateColumn({ name: 'fecha_cierre', type: 'timestamptz', default: () => 'NOW()' })
  fechaCierre: Date;

  @Column({ name: 'estado_contable', type: 'varchar', length: 20, default: ESTADO_CONTABLE_PENDIENTE })
  estadoContable: EstadoContableCierre;

  @Column({ name: 'resultado_contable_event_id', type: 'uuid', nullable: true })
  resultadoContableEventId: string | null;

  @Column({ name: 'resultado_contable_en', type: 'timestamptz', nullable: true })
  resultadoContableEn: Date | null;

  @Column({ name: 'codigo_rechazo_contable', type: 'varchar', length: 100, nullable: true })
  codigoRechazoContable: string | null;

  @Column({ name: 'detalle_contable', type: 'varchar', length: 500, nullable: true })
  detalleContable: string | null;
}
