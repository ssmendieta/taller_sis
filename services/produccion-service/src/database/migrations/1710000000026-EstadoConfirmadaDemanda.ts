import { MigrationInterface, QueryRunner } from 'typeorm';

export class EstadoConfirmadaDemanda1710000000026 implements MigrationInterface {
  name = 'EstadoConfirmadaDemanda1710000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ABC-364 (ABC-130): habilitar estado CONFIRMADA y campos de confirmacion en la misma tabla demandas
    await queryRunner.query('ALTER TABLE demandas DROP CONSTRAINT ck_demanda_estado;');
    await queryRunner.query("ALTER TABLE demandas ADD CONSTRAINT ck_demanda_estado CHECK (estado IN ('RECIBIDA', 'CONFIRMADA'));");

    await queryRunner.query('ALTER TABLE demandas ADD COLUMN confirmada_en TIMESTAMPTZ;');
    await queryRunner.query('ALTER TABLE demandas ADD COLUMN confirmacion_event_id UUID;');
    await queryRunner.query('ALTER TABLE demandas ADD COLUMN confirmacion_correlation_id UUID;');

    await queryRunner.query("CREATE INDEX ix_demandas_confirmadas ON demandas (estado, fecha_requerida) WHERE estado = 'CONFIRMADA';");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS ix_demandas_confirmadas;');
    await queryRunner.query('ALTER TABLE demandas DROP COLUMN confirmacion_correlation_id;');
    await queryRunner.query('ALTER TABLE demandas DROP COLUMN confirmacion_event_id;');
    await queryRunner.query('ALTER TABLE demandas DROP COLUMN confirmada_en;');

    await queryRunner.query('ALTER TABLE demandas DROP CONSTRAINT ck_demanda_estado;');
    await queryRunner.query("ALTER TABLE demandas ADD CONSTRAINT ck_demanda_estado CHECK (estado IN ('RECIBIDA'));");
  }
}
