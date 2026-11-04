import { MigrationInterface, QueryRunner } from 'typeorm';

export class SolicitudesMaterial1710000000012 implements MigrationInterface {
  name = 'SolicitudesMaterial1710000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE solicitudes_material (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        solicitante_usuario_id BIGINT NOT NULL,
        fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        CONSTRAINT fk_solicitud_material_orden FOREIGN KEY (orden_id)
          REFERENCES ordenes_produccion(id) ON DELETE RESTRICT
      );
    `);
    await queryRunner.query(`CREATE INDEX ix_solicitudes_material_orden ON solicitudes_material (orden_id);`);
    await queryRunner.query(`
      CREATE TABLE solicitud_material_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        solicitud_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        cantidad NUMERIC(14,4) NOT NULL,
        unidad VARCHAR(40) NOT NULL,
        CONSTRAINT fk_solicitud_material_item_solicitud FOREIGN KEY (solicitud_id)
          REFERENCES solicitudes_material(id) ON DELETE RESTRICT,
        CONSTRAINT fk_solicitud_material_item_material FOREIGN KEY (material_id)
          REFERENCES materiales(id) ON DELETE RESTRICT,
        CONSTRAINT ck_solicitud_material_item_cantidad CHECK (cantidad > 0),
        CONSTRAINT ck_solicitud_material_item_unidad
          CHECK (unidad IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete'))
      );
    `);
    await queryRunner.query(`CREATE INDEX ix_solicitud_material_items_solicitud ON solicitud_material_items (solicitud_id);`);
    await queryRunner.query(`CREATE INDEX ix_solicitud_material_items_material ON solicitud_material_items (material_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE solicitud_material_items;`);
    await queryRunner.query(`DROP TABLE solicitudes_material;`);
  }
}
