import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BoletaEnvio } from '../../boletas/entities/boleta-envio.entity';
import { RutaParada } from './ruta-parada.entity';

// Documento (boleta emitida) que se entrega en una parada. La boleta vive en
// la misma base de Logística, por eso sí tiene clave foránea.
@Entity('rutas_paradas_boletas')
@Unique('uq_ruta_parada_boleta', ['paradaId', 'boletaId'])
export class RutaParadaBoleta {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'parada_id', type: 'bigint' })
  paradaId!: string;

  @ManyToOne(() => RutaParada, (parada) => parada.boletas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parada_id', foreignKeyConstraintName: 'fk_ruta_parada_boleta_parada' })
  parada!: RutaParada;

  @Index('ix_rutas_paradas_boletas_boleta')
  @Column({ name: 'boleta_id', type: 'bigint' })
  boletaId!: string;

  @ManyToOne(() => BoletaEnvio, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'boleta_id', foreignKeyConstraintName: 'fk_ruta_parada_boleta_boleta' })
  boleta!: BoletaEnvio;
}
