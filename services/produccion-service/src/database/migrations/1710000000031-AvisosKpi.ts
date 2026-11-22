import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-500: avisos internos cuando un KPI pasa a rojo.
export class AvisosKpi1710000000031 implements MigrationInterface {
  name = 'AvisosKpi1710000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE metas_kpi
        ADD COLUMN ultimo_color VARCHAR(10),
        ADD CONSTRAINT ck_meta_kpi_ultimo_color CHECK (ultimo_color IS NULL OR ultimo_color IN ('VERDE','AMARILLO','ROJO'));
    `);
    await queryRunner.query(`
      CREATE TABLE avisos_kpi (
        id BIGSERIAL PRIMARY KEY,
        kpi VARCHAR(60) NOT NULL REFERENCES metas_kpi(kpi),
        valor NUMERIC(14,4) NOT NULL,
        meta NUMERIC(14,4),
        fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        leido BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);
    await queryRunner.query(`CREATE INDEX ix_avisos_kpi_leido_fecha ON avisos_kpi (leido, fecha DESC);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE avisos_kpi;`);
    await queryRunner.query(`ALTER TABLE metas_kpi DROP CONSTRAINT ck_meta_kpi_ultimo_color, DROP COLUMN ultimo_color;`);
  }
}
