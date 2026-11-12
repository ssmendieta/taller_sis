import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-345: fuente interna de precios para el costo base del cierre.
// No toca cierres_produccion (snapshot inmutable).
export class CostoUnitarioMateriales1710000000029 implements MigrationInterface {
  name = 'CostoUnitarioMateriales1710000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE materiales ADD COLUMN costo_unitario NUMERIC(14,4);');
    await queryRunner.query("ALTER TABLE materiales ADD COLUMN moneda_costo VARCHAR(3) NOT NULL DEFAULT 'BOB';");
    await queryRunner.query(`
      ALTER TABLE materiales ADD CONSTRAINT ck_materiales_costo_unitario
      CHECK (costo_unitario IS NULL OR (costo_unitario >= 0 AND costo_unitario <> 'NaN'::numeric));
    `);
    await queryRunner.query("ALTER TABLE materiales ADD CONSTRAINT ck_materiales_moneda_costo CHECK (moneda_costo = 'BOB');");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE materiales DROP CONSTRAINT ck_materiales_moneda_costo;');
    await queryRunner.query('ALTER TABLE materiales DROP CONSTRAINT ck_materiales_costo_unitario;');
    await queryRunner.query('ALTER TABLE materiales DROP COLUMN moneda_costo;');
    await queryRunner.query('ALTER TABLE materiales DROP COLUMN costo_unitario;');
  }
}
