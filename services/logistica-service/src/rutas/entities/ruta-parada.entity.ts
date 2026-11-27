import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { EstadoEntrega } from '../../despacho/estado-entrega.enum';
import { Ruta } from './ruta.entity';
import { RutaParadaBoleta } from './ruta-parada-boleta.entity';

@Entity('rutas_paradas')
@Unique('uq_ruta_parada_secuencia', ['rutaId', 'secuencia'])
// ABC-380: destino de la FK compuesta de incidencias_transporte (parada de la misma ruta).
@Unique('uq_ruta_parada_id_ruta', ['id', 'rutaId'])
@Check('ck_ruta_parada_secuencia', 'secuencia > 0')
@Check('ck_ruta_parada_destino', 'LENGTH(BTRIM(destino)) > 0')
@Check('ck_ruta_parada_estado_entrega', "estado_entrega IN ('PENDIENTE','ENTREGADA','ANULADA')")
@Check('ck_ruta_parada_entrega_autor', "estado_entrega = 'PENDIENTE' OR (entrega_actualizada_en IS NOT NULL AND entrega_usuario_id > 0)")
@Check('ck_ruta_parada_entrega_observacion', "entrega_observacion IS NULL OR (estado_entrega <> 'PENDIENTE' AND LENGTH(BTRIM(entrega_observacion)) > 0)")
@Check('ck_ruta_parada_entregada_en', "entregada_en IS NULL OR estado_entrega = 'ENTREGADA'")
@Check('ck_ruta_parada_diferencia_minutos', "diferencia_minutos IS NULL OR estado_entrega = 'ENTREGADA'")
@Check('ck_ruta_parada_motivo_retraso', "motivo_retraso IS NULL OR (estado_entrega = 'ENTREGADA' AND LENGTH(BTRIM(motivo_retraso)) > 0)")
export class RutaParada {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'ruta_id', type: 'bigint' })
  rutaId!: string;

  @ManyToOne(() => Ruta, (ruta) => ruta.paradas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ruta_id', foreignKeyConstraintName: 'fk_ruta_parada_ruta' })
  ruta!: Ruta;

  @Column({ type: 'integer' })
  secuencia!: number;

  @Column({ type: 'varchar', length: 250 })
  destino!: string;

  @Column({ name: 'estado_entrega', type: 'varchar', length: 20, default: EstadoEntrega.PENDIENTE })
  estadoEntrega!: EstadoEntrega;

  @Column({ name: 'entrega_actualizada_en', type: 'timestamptz', nullable: true })
  entregaActualizadaEn!: Date | null;

  @Column({ name: 'entrega_usuario_id', type: 'bigint', nullable: true })
  entregaUsuarioId!: string | null;

  @Column({ name: 'entrega_observacion', type: 'varchar', length: 500, nullable: true })
  entregaObservacion!: string | null;

  // ABC-453: hora real de entrega; solo existe en paradas ENTREGADA.
  @Column({ name: 'entregada_en', type: 'timestamptz', nullable: true })
  entregadaEn!: Date | null;

  // ABC-524: minutos respecto de la hora programada (positivo = retraso) y su motivo.
  @Column({ name: 'diferencia_minutos', type: 'integer', nullable: true })
  diferenciaMinutos!: number | null;

  @Column({ name: 'motivo_retraso', type: 'varchar', length: 500, nullable: true })
  motivoRetraso!: string | null;

  @OneToMany(() => RutaParadaBoleta, (documento) => documento.parada, { cascade: false })
  boletas!: RutaParadaBoleta[];
}
