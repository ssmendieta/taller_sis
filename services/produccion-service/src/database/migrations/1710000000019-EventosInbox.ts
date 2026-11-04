import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventosInbox1710000000019 implements MigrationInterface {
  name = 'EventosInbox1710000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE solicitudes_material
        ADD COLUMN solicitud_version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN estado_actualizado_en TIMESTAMPTZ,
        ADD COLUMN motivo_estado VARCHAR(500),
        ADD CONSTRAINT ck_solicitud_material_version CHECK (solicitud_version > 0);
    `);
    await queryRunner.query(`
      CREATE TABLE eventos_inbox (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        event_id UUID NOT NULL,
        correlation_id UUID NOT NULL,
        event_type VARCHAR(120) NOT NULL,
        payload_hash CHAR(64) NOT NULL,
        payload JSONB NOT NULL,
        estado VARCHAR(20) NOT NULL,
        message_id VARCHAR(255),
        detalle VARCHAR(500),
        recibido_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        procesado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_eventos_inbox_event_id UNIQUE (event_id),
        CONSTRAINT ck_eventos_inbox_estado CHECK (estado IN ('PROCESADO', 'IGNORADO')),
        CONSTRAINT ck_eventos_inbox_payload CHECK (jsonb_typeof(payload) = 'object')
      );
    `);
    await queryRunner.query(`
      CREATE INDEX ix_eventos_inbox_correlacion
        ON eventos_inbox (correlation_id, recibido_en DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE eventos_inbox;');
    await queryRunner.query(`
      ALTER TABLE solicitudes_material
        DROP CONSTRAINT ck_solicitud_material_version,
        DROP COLUMN motivo_estado,
        DROP COLUMN estado_actualizado_en,
        DROP COLUMN solicitud_version;
    `);
  }
}
