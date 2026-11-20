import { MigrationInterface, QueryRunner } from 'typeorm';

export class CrearMetasKpi1710000000030 implements MigrationInterface {
  name = 'CrearMetasKpi1710000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE metas_kpi (
        kpi VARCHAR(60) PRIMARY KEY,
        meta NUMERIC(14,4),
        unidad VARCHAR(20) NOT NULL,
        umbral_amarillo_pct NUMERIC(6,2) NOT NULL,
        umbral_rojo_pct NUMERIC(6,2) NOT NULL,
        sentido VARCHAR(20) NOT NULL,
        actualizado_por BIGINT,
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_meta_kpi_kpi CHECK (kpi IN ('CUMPLIMIENTO_FECHA','TIEMPO_CICLO','FPY','MERMA')),
        CONSTRAINT ck_meta_kpi_sentido CHECK (sentido IN ('MAYOR_ES_MEJOR','MENOR_ES_MEJOR')),
        CONSTRAINT ck_meta_kpi_meta_positiva CHECK (meta IS NULL OR (meta > 0 AND meta <> 'NaN'::numeric)),
        CONSTRAINT ck_meta_kpi_umbrales CHECK (umbral_amarillo_pct >= 0 AND umbral_rojo_pct > umbral_amarillo_pct),
        CONSTRAINT ck_meta_kpi_actualizado_por CHECK (actualizado_por IS NULL OR actualizado_por > 0)
      );
    `);
    await queryRunner.query(`
      INSERT INTO metas_kpi (kpi, meta, unidad, umbral_amarillo_pct, umbral_rojo_pct, sentido) VALUES
        ('CUMPLIMIENTO_FECHA', 90, '%', 10, 20, 'MAYOR_ES_MEJOR'),
        ('TIEMPO_CICLO', 48, 'horas', 10, 20, 'MENOR_ES_MEJOR'),
        ('FPY', 95, '%', 10, 20, 'MAYOR_ES_MEJOR'),
        ('MERMA', 5, '%', 10, 20, 'MENOR_ES_MEJOR');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE metas_kpi;`);
  }
}
