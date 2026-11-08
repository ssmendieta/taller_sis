import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConfirmacionesDemandaPendientes1710000000028 implements MigrationInterface {
  name = 'ConfirmacionesDemandaPendientes1710000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE eventos_inbox DROP CONSTRAINT ck_eventos_inbox_estado;');
    await queryRunner.query(`
      ALTER TABLE eventos_inbox ADD CONSTRAINT ck_eventos_inbox_estado
      CHECK (estado IN ('PROCESADO', 'IGNORADO', 'PENDIENTE'));
    `);
    await queryRunner.query('ALTER TABLE eventos_inbox ADD COLUMN intentos SMALLINT NOT NULL DEFAULT 0;');
    await queryRunner.query('ALTER TABLE eventos_inbox ADD COLUMN proximo_intento_en TIMESTAMPTZ;');
    await queryRunner.query('ALTER TABLE eventos_inbox ADD COLUMN ultimo_error VARCHAR(500);');
    await queryRunner.query(`
      CREATE INDEX ix_eventos_inbox_confirmacion_pendiente
      ON eventos_inbox (proximo_intento_en, recibido_en)
      WHERE estado = 'PENDIENTE' AND event_type = 'DemandaConfirmada.v1';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS ix_eventos_inbox_confirmacion_pendiente;');
    await queryRunner.query("UPDATE eventos_inbox SET estado = 'IGNORADO' WHERE estado = 'PENDIENTE';");
    await queryRunner.query('ALTER TABLE eventos_inbox DROP CONSTRAINT ck_eventos_inbox_estado;');
    await queryRunner.query(`
      ALTER TABLE eventos_inbox ADD CONSTRAINT ck_eventos_inbox_estado
      CHECK (estado IN ('PROCESADO', 'IGNORADO'));
    `);
    await queryRunner.query('ALTER TABLE eventos_inbox DROP COLUMN ultimo_error;');
    await queryRunner.query('ALTER TABLE eventos_inbox DROP COLUMN proximo_intento_en;');
    await queryRunner.query('ALTER TABLE eventos_inbox DROP COLUMN intentos;');
  }
}
