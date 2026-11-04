import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsumosMaterial1710000000013 implements MigrationInterface {
  name = 'ConsumosMaterial1710000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE consumos_material (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        cantidad NUMERIC(14,4) NOT NULL,
        unidad VARCHAR(40) NOT NULL,
        usuario_registro_id BIGINT NOT NULL,
        fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_consumo_material_orden FOREIGN KEY (orden_id)
          REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
        CONSTRAINT fk_consumo_material_material FOREIGN KEY (material_id)
          REFERENCES materiales(id) ON DELETE RESTRICT,
        CONSTRAINT ck_consumo_material_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
        CONSTRAINT ck_consumo_material_unidad
          CHECK (unidad IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete')),
        CONSTRAINT ck_consumo_material_usuario CHECK (usuario_registro_id > 0)
      );
    `);
    await queryRunner.query(`CREATE INDEX ix_consumos_material_orden ON consumos_material (orden_id);`);
    await queryRunner.query(`CREATE INDEX ix_consumos_material_material ON consumos_material (material_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE consumos_material;`);
  }
}
