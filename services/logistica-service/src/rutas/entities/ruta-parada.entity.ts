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
@Check('ck_ruta_parada_secuencia', 'secuencia > 0')
@Check('ck_ruta_parada_destino', 'LENGTH(BTRIM(destino)) > 0')
@Check('ck_ruta_parada_estado_entrega', "estado_entrega IN ('PENDIENTE','ENTREGADA','ANULADA')")
@Check('ck_ruta_parada_entrega_autor', "estado_entrega = 'PENDIENTE' OR (entrega_actualizada_en IS NOT NULL AND entrega_usuario_id > 0)")
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

  @OneToMany(() => RutaParadaBoleta, (documento) => documento.parada, { cascade: false })
  boletas!: RutaParadaBoleta[];
}
