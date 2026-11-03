import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';
import { TipoObservacion } from './tipo-observacion.enum';

// ABC-321: observación o incidencia de una orden. No registra mermas ni calidad.
@Entity('observaciones_orden')
@Check('ck_observacion_orden_tipo', "tipo IN ('OBSERVACION','INCIDENCIA')")
@Check('ck_observacion_orden_descripcion', 'LENGTH(BTRIM(descripcion)) > 0')
@Check('ck_observacion_orden_autor', 'autor_usuario_id > 0')
@Index('ix_observaciones_orden_fecha', ['ordenId', 'fechaHora', 'id'])
export class ObservacionOrden {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({
    name: 'orden_id',
    type: 'bigint',
    transformer: {
      to: (value: string | null | undefined) => value,
      from: (value: string | number | null | undefined) => value == null ? value : String(value),
    },
  })
  ordenId: string;

  @ManyToOne(() => OrdenProduccion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_observacion_orden_orden' })
  orden: OrdenProduccion;

  @Column({ type: 'varchar', length: 20 })
  tipo: TipoObservacion;

  @Column({ type: 'varchar', length: 1000 })
  descripcion: string;

  @Column({ name: 'autor_usuario_id', type: 'bigint' })
  autorUsuarioId: string;

  // Nombre visible del autor al momento de registrar, para mostrarlo sin consultar Auth.
  @Column({ name: 'autor_nombre', type: 'varchar', length: 150, nullable: true })
  autorNombre: string | null;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz', default: () => 'NOW()' })
  fechaHora: Date;
}
