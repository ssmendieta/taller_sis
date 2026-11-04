import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReglaConcurrenciaDocumental1710000000003 implements MigrationInterface {
  name = 'ReglaConcurrenciaDocumental1710000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE boleta_emision_bloqueos (
        orden_id BIGINT NOT NULL,
        producto_id BIGINT NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (orden_id, producto_id),
        CONSTRAINT ck_boleta_emision_bloqueo_orden CHECK (orden_id > 0),
        CONSTRAINT ck_boleta_emision_bloqueo_producto CHECK (producto_id > 0)
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE boleta_emision_bloqueos;');
  }
}
