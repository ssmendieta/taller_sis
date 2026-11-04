import { MigrationInterface, QueryRunner } from 'typeorm';

export class Lotes1710000000016 implements MigrationInterface {
  name = 'Lotes1710000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE lotes (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        codigo VARCHAR(80) NOT NULL,
        orden_id BIGINT NOT NULL,
        cantidad NUMERIC(14,4) NOT NULL,
        responsable_usuario_id BIGINT NOT NULL,
        fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_lotes_codigo UNIQUE (codigo),
        CONSTRAINT fk_lote_orden FOREIGN KEY (orden_id)
          REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
        CONSTRAINT ck_lote_codigo CHECK (codigo = BTRIM(codigo) AND LENGTH(codigo) > 0),
        CONSTRAINT ck_lote_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
        CONSTRAINT ck_lote_responsable CHECK (responsable_usuario_id > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_lotes_orden ON lotes (orden_id);');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE lotes;');
  }
}
