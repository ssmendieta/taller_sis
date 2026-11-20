import { Check, Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type SentidoKpi = 'MAYOR_ES_MEJOR' | 'MENOR_ES_MEJOR';

/** Meta de un KPI. Una sola fila por KPI. Los umbrales son % de desviación adversa respecto a la meta. */
@Entity('metas_kpi')
@Check('ck_meta_kpi_sentido', "sentido IN ('MAYOR_ES_MEJOR','MENOR_ES_MEJOR')")
@Check('ck_meta_kpi_meta_positiva', 'meta IS NULL OR (meta > 0 AND meta <> \'NaN\'::numeric)')
@Check(
  'ck_meta_kpi_umbrales',
  'umbral_amarillo_pct >= 0 AND umbral_rojo_pct > umbral_amarillo_pct',
)
@Check('ck_meta_kpi_actualizado_por', 'actualizado_por IS NULL OR actualizado_por > 0')
export class MetaKpi {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  kpi: string;

  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true })
  meta: string | null;

  @Column({ type: 'varchar', length: 20 })
  unidad: string;

  @Column({ name: 'umbral_amarillo_pct', type: 'numeric', precision: 6, scale: 2 })
  umbralAmarilloPct: string;

  @Column({ name: 'umbral_rojo_pct', type: 'numeric', precision: 6, scale: 2 })
  umbralRojoPct: string;

  @Column({ type: 'varchar', length: 20 })
  sentido: SentidoKpi;

  @Column({ name: 'actualizado_por', type: 'bigint', nullable: true })
  actualizadoPor: string | null;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz', default: () => 'NOW()' })
  actualizadoEn: Date;
}
