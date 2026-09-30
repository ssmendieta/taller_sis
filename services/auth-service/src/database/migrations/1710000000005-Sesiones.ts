import { MigrationInterface, QueryRunner } from 'typeorm';

export class Sesiones1710000000005 implements MigrationInterface {
  name = 'Sesiones1710000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sesiones (
        jti               TEXT PRIMARY KEY,
        usuario_id        BIGINT NOT NULL,
        emitida_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ultima_actividad  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revocada_en       TIMESTAMPTZ,
        CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id)
          REFERENCES usuarios(id) ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_sesiones_usuario ON sesiones (usuario_id, ultima_actividad DESC);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sesiones;`);
  }
}
