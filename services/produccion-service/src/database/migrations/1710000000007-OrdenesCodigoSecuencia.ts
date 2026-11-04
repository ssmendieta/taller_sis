import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrdenesCodigoSecuencia1710000000007 implements MigrationInterface {
  name = 'OrdenesCodigoSecuencia1710000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS secuencia_codigo_orden START WITH 1 INCREMENT BY 1;`,
    );
    await queryRunner.query(`
      ALTER TABLE ordenes_produccion
        ADD COLUMN IF NOT EXISTS responsable_nombre VARCHAR(150);
    `);
    await queryRunner.query(`
      ALTER TABLE historial_estado_orden
        ADD COLUMN IF NOT EXISTS usuario_responsable_nombre VARCHAR(150);
    `);
    await queryRunner.query(`
      ALTER TABLE avances_produccion
        ADD COLUMN IF NOT EXISTS usuario_responsable_nombre VARCHAR(150);
    `);
    await queryRunner.query(`
      UPDATE ordenes_produccion
      SET responsable_nombre = 'Usuario #' || responsable_usuario_id
      WHERE responsable_nombre IS NULL;
    `);
    await queryRunner.query(`
      UPDATE historial_estado_orden
      SET usuario_responsable_nombre = 'Usuario #' || usuario_responsable_id
      WHERE usuario_responsable_nombre IS NULL;
    `);
    await queryRunner.query(`
      UPDATE avances_produccion
      SET usuario_responsable_nombre = 'Usuario #' || usuario_responsable_id
      WHERE usuario_responsable_nombre IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE avances_produccion DROP COLUMN IF EXISTS usuario_responsable_nombre;`,
    );
    await queryRunner.query(
      `ALTER TABLE historial_estado_orden DROP COLUMN IF EXISTS usuario_responsable_nombre;`,
    );
    await queryRunner.query(
      `ALTER TABLE ordenes_produccion DROP COLUMN IF EXISTS responsable_nombre;`,
    );
    await queryRunner.query(`DROP SEQUENCE IF EXISTS secuencia_codigo_orden;`);
  }
}
