import { MigrationInterface, QueryRunner } from 'typeorm';

export class CrearSolicitudesSalida1710000000001 implements MigrationInterface {
  name = 'CrearSolicitudesSalida1710000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE solicitudes_salida (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        destino_documental VARCHAR(250) NOT NULL,
        motivo VARCHAR(500) NOT NULL,
        responsable_usuario_id BIGINT NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_solicitud_salida_destino CHECK (LENGTH(BTRIM(destino_documental)) > 0),
        CONSTRAINT ck_solicitud_salida_estado CHECK (estado IN ('BORRADOR','PREPARADA')),
        CONSTRAINT ck_solicitud_salida_responsable CHECK (responsable_usuario_id > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_solicitudes_salida_orden ON solicitudes_salida (orden_id);');
    await queryRunner.query(`
      CREATE TABLE solicitudes_salida_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        solicitud_id BIGINT NOT NULL,
        referencia VARCHAR(160) NOT NULL,
        cantidad NUMERIC(14,4) NOT NULL,
        CONSTRAINT fk_solicitud_salida_item_solicitud FOREIGN KEY (solicitud_id)
          REFERENCES solicitudes_salida(id) ON DELETE CASCADE,
        CONSTRAINT ck_solicitud_salida_item_referencia CHECK (LENGTH(BTRIM(referencia)) > 0),
        CONSTRAINT ck_solicitud_salida_item_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_solicitudes_salida_items_solicitud ON solicitudes_salida_items (solicitud_id);');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE solicitudes_salida_items;');
    await queryRunner.query('DROP TABLE solicitudes_salida;');
  }
}
