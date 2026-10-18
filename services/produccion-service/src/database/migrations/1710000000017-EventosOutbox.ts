import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventosOutbox1710000000017 implements MigrationInterface {
  name = 'EventosOutbox1710000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE eventos_outbox (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        event_id UUID NOT NULL,
        correlation_id UUID NOT NULL,
        event_type VARCHAR(120) NOT NULL,
        aggregate_type VARCHAR(80) NOT NULL,
        aggregate_id VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        intentos INTEGER NOT NULL DEFAULT 0,
        message_id VARCHAR(255),
        ultimo_error TEXT,
        proximo_intento_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ultimo_intento_en TIMESTAMPTZ,
        bloqueo_token UUID,
        bloqueo_hasta TIMESTAMPTZ,
        publicado_en TIMESTAMPTZ,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_eventos_outbox_event_id UNIQUE (event_id),
        CONSTRAINT uq_eventos_outbox_agregado_evento
          UNIQUE (aggregate_type, aggregate_id, event_type),
        CONSTRAINT ck_eventos_outbox_estado
          CHECK (estado IN ('PENDIENTE', 'PROCESANDO', 'PUBLICADO')),
        CONSTRAINT ck_eventos_outbox_intentos CHECK (intentos >= 0)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX ix_eventos_outbox_pendientes
        ON eventos_outbox (estado, proximo_intento_en, creado_en);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE eventos_outbox;');
  }
}
