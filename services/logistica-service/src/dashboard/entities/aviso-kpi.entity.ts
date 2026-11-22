import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Aviso interno generado cuando un KPI cambia a rojo (ABC-500). */
@Entity('avisos_kpi')
@Index('ix_avisos_kpi_leido_fecha', ['leido', 'fecha'])
export class AvisoKpi {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 60 })
  kpi: string;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  valor: string;

  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true })
  meta: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  fecha: Date;

  @Column({ type: 'boolean', default: false })
  leido: boolean;
}
