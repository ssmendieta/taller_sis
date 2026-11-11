import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductoUnidadBoleta1710000000013 implements MigrationInterface {
  name = 'ProductoUnidadBoleta1710000000013';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE boletas_envio
        ADD COLUMN producto_codigo VARCHAR(80),
        ADD COLUMN unidad VARCHAR(20);
    `);
    await queryRunner.query(`
      ALTER TABLE boletas_envio
        ADD CONSTRAINT ck_boleta_envio_producto_codigo
          CHECK (producto_codigo IS NULL OR LENGTH(BTRIM(producto_codigo)) > 0),
        ADD CONSTRAINT ck_boleta_envio_unidad
          CHECK (unidad IS NULL OR unidad IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete'));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE boletas_envio DROP CONSTRAINT ck_boleta_envio_unidad;');
    await queryRunner.query('ALTER TABLE boletas_envio DROP CONSTRAINT ck_boleta_envio_producto_codigo;');
    await queryRunner.query('ALTER TABLE boletas_envio DROP COLUMN unidad;');
    await queryRunner.query('ALTER TABLE boletas_envio DROP COLUMN producto_codigo;');
  }
}
