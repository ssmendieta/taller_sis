import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-387: inbox de Logística y resultado de Inventarios en la ruta. El estado de
// Inventarios es independiente del estado de tránsito y entrega de la ruta.
export class ResultadoInventarioRuta1710000000012 implements MigrationInterface {
  name = 'ResultadoInventarioRuta1710000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
        CONSTRAINT uq_eventos_inbox_event_id UNIQUE (event_id),
        CONSTRAINT ck_eventos_inbox_estado CHECK (estado IN ('PROCESADO', 'IGNORADO')),
        CONSTRAINT ck_eventos_inbox_payload CHECK (jsonb_typeof(payload) = 'object')
      );
    `);
    await queryRunner.query('CREATE INDEX ix_eventos_inbox_correlacion ON eventos_inbox (correlation_id, recibido_en);');
    await queryRunner.query(`
      ALTER TABLE rutas
        ADD COLUMN inventario_estado VARCHAR(20) NULL,
        ADD COLUMN inventario_resultado_event_id UUID NULL,
        ADD COLUMN inventario_resultado_en TIMESTAMPTZ NULL,
        ADD COLUMN inventario_codigo_rechazo VARCHAR(100) NULL,
        ADD COLUMN inventario_detalle VARCHAR(500) NULL,
        ADD CONSTRAINT uq_ruta_inventario_resultado_event UNIQUE (inventario_resultado_event_id),
        ADD CONSTRAINT ck_ruta_inventario_resultado CHECK (
          (inventario_estado IS NULL AND inventario_resultado_event_id IS NULL AND inventario_resultado_en IS NULL
            AND inventario_codigo_rechazo IS NULL)
          OR (inventario_estado = 'ACEPTADA' AND inventario_resultado_event_id IS NOT NULL
            AND inventario_resultado_en IS NOT NULL AND inventario_codigo_rechazo IS NULL)
          OR (inventario_estado = 'RECHAZADA' AND inventario_resultado_event_id IS NOT NULL
            AND inventario_resultado_en IS NOT NULL AND inventario_codigo_rechazo IS NOT NULL)
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rutas
        DROP CONSTRAINT ck_ruta_inventario_resultado,
        DROP CONSTRAINT uq_ruta_inventario_resultado_event,
        DROP COLUMN inventario_detalle,
        DROP COLUMN inventario_codigo_rechazo,
        DROP COLUMN inventario_resultado_en,
        DROP COLUMN inventario_resultado_event_id,
        DROP COLUMN inventario_estado;
    `);
    await queryRunner.query('DROP TABLE eventos_inbox;');
  }
}
