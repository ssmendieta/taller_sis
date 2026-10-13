import { MigrationInterface, QueryRunner } from 'typeorm';

export class CrearBoletasEnvio1710000000002 implements MigrationInterface {
  name = 'CrearBoletasEnvio1710000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE SEQUENCE boletas_envio_numero_seq START WITH 1 INCREMENT BY 1;
    `);
    await queryRunner.query(`
      CREATE TABLE boletas_envio (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        solicitud_salida_id BIGINT NOT NULL,
        numero VARCHAR(16) NOT NULL DEFAULT (
          'BOL-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' ||
          LPAD(nextval('boletas_envio_numero_seq')::text, 5, '0')
        ),
        estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
        responsable_usuario_id BIGINT NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_boleta_envio_numero UNIQUE (numero),
        CONSTRAINT fk_boleta_envio_solicitud FOREIGN KEY (solicitud_salida_id)
          REFERENCES solicitudes_salida(id) ON DELETE RESTRICT,
        CONSTRAINT ck_boleta_envio_estado CHECK (estado IN ('BORRADOR','EMITIDA','ANULADA')),
        CONSTRAINT ck_boleta_envio_responsable CHECK (responsable_usuario_id > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_boletas_envio_solicitud ON boletas_envio (solicitud_salida_id);');
    await queryRunner.query(`
      CREATE TABLE boletas_envio_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        boleta_id BIGINT NOT NULL,
        referencia VARCHAR(160) NOT NULL,
        cantidad NUMERIC(14,4) NOT NULL,
        CONSTRAINT fk_boleta_envio_item_boleta FOREIGN KEY (boleta_id)
          REFERENCES boletas_envio(id) ON DELETE CASCADE,
        CONSTRAINT ck_boleta_envio_item_referencia CHECK (LENGTH(BTRIM(referencia)) > 0),
        CONSTRAINT ck_boleta_envio_item_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_boletas_envio_items_boleta ON boletas_envio_items (boleta_id);');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE boletas_envio_items;');
    await queryRunner.query('DROP TABLE boletas_envio;');
    await queryRunner.query('DROP SEQUENCE boletas_envio_numero_seq;');
  }
}
