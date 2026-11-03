import { MigrationInterface, QueryRunner } from 'typeorm';

export class Demandas1710000000024 implements MigrationInterface {
  name = 'Demandas1710000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE demandas (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        origen VARCHAR(20) NOT NULL,
        demanda_externa_id VARCHAR(80) NOT NULL,
        fecha_requerida DATE NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'RECIBIDA',
        event_id UUID NOT NULL,
        correlation_id UUID NOT NULL,
        contenido_hash CHAR(64) NOT NULL,
        recibida_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_demanda_origen_externa UNIQUE (origen, demanda_externa_id),
        CONSTRAINT ck_demanda_origen CHECK (origen IN ('VENTAS','FACTURACION')),
        CONSTRAINT ck_demanda_estado CHECK (estado IN ('RECIBIDA')),
        CONSTRAINT ck_demanda_externa_id CHECK (LENGTH(BTRIM(demanda_externa_id)) > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_demandas_estado_origen ON demandas (estado, origen, recibida_en);');
    await queryRunner.query(`
      CREATE TABLE demandas_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        demanda_id BIGINT NOT NULL,
        producto_codigo VARCHAR(80) NOT NULL,
        cantidad NUMERIC(14,4) NOT NULL,
        unidad VARCHAR(20) NOT NULL,
        CONSTRAINT fk_demanda_item_demanda FOREIGN KEY (demanda_id) REFERENCES demandas(id) ON DELETE CASCADE,
        CONSTRAINT uq_demanda_item_producto UNIQUE (demanda_id, producto_codigo),
        CONSTRAINT ck_demanda_item_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
        CONSTRAINT ck_demanda_item_producto CHECK (LENGTH(BTRIM(producto_codigo)) > 0),
        CONSTRAINT ck_demanda_item_unidad CHECK (LENGTH(BTRIM(unidad)) > 0)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE demandas_items;');
    await queryRunner.query('DROP TABLE demandas;');
  }
}
