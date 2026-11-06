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
import { ResultadoConforme } from '../../calidad/entities/resultado-conforme.entity';
import { OrdenProduccion } from '../../ordenes/entities/orden-produccion.entity';

@Entity('reprocesos')
@Check(
  'ck_reproceso_cantidades_no_negativas',
  "cantidad_procesada >= 0 AND cantidad_procesada <> 'NaN'::numeric AND cantidad_recuperada >= 0 AND cantidad_recuperada <> 'NaN'::numeric AND cantidad_descartada >= 0 AND cantidad_descartada <> 'NaN'::numeric",
)
@Check(
  'ck_reproceso_balance_cantidades',
  'cantidad_recuperada + cantidad_descartada = cantidad_procesada',
)
@Check('ck_reproceso_autor', 'autor_usuario_id > 0')
@Index('ix_reprocesos_orden_fecha', ['ordenId', 'fechaHora'])
@Index('ix_reprocesos_resultado_calidad', ['resultadoCalidadId'])
export class Reproceso {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id: string;

  @Column({
    name: 'orden_id',
    type: 'bigint',
    transformer: {
      to: (value: string | null | undefined) => value,
      from: (value: string | number | null | undefined) => (value == null ? value : String(value)),
    },
  })
  ordenId: string;

  @ManyToOne(() => OrdenProduccion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id', foreignKeyConstraintName: 'fk_reproceso_orden' })
  orden: OrdenProduccion;

  @Column({
    name: 'resultado_calidad_id',
    type: 'bigint',
    transformer: {
      to: (value: string | null | undefined) => value,
      from: (value: string | number | null | undefined) => (value == null ? value : String(value)),
    },
  })
  resultadoCalidadId: string;

  @ManyToOne(() => ResultadoConforme, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resultado_calidad_id', foreignKeyConstraintName: 'fk_reproceso_resultado_calidad' })
  resultadoCalidad: ResultadoConforme;

  @Column({ name: 'cantidad_procesada', type: 'numeric', precision: 14, scale: 4 })
  cantidadProcesada: string;

  @Column({ name: 'cantidad_recuperada', type: 'numeric', precision: 14, scale: 4 })
  cantidadRecuperada: string;

  @Column({ name: 'cantidad_descartada', type: 'numeric', precision: 14, scale: 4 })
  cantidadDescartada: string;

  @Column({ name: 'autor_usuario_id', type: 'bigint' })
  autorUsuarioId: string;

  @CreateDateColumn({ name: 'fecha_hora', type: 'timestamptz', default: () => 'NOW()' })
  fechaHora: Date;
}
