import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventarioMaterial1710000000004 implements MigrationInterface {
  name = 'InventarioMaterial1710000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventario_material (
        id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        material_id          BIGINT NOT NULL UNIQUE,
        cantidad_disponible  NUMERIC(14,4) NOT NULL DEFAULT 0,
        actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_inventario_material
          FOREIGN KEY (material_id) REFERENCES materiales(id) ON DELETE RESTRICT,
        CONSTRAINT ck_inventario_cantidad CHECK (cantidad_disponible >= 0)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS inventario_material;');
  }
}
