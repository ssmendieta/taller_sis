import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditoriaInmutable1710000000006 implements MigrationInterface {
  name = 'AuditoriaInmutable1710000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION impedir_cambios_auditoria()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'La tabla auditoria es inmutable: no se permiten UPDATE ni DELETE';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria;`,
    );
    await queryRunner.query(`
      CREATE TRIGGER trg_auditoria_inmutable
      BEFORE UPDATE OR DELETE ON auditoria
      FOR EACH ROW EXECUTE FUNCTION impedir_cambios_auditoria();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS impedir_cambios_auditoria();`,
    );
  }
}
