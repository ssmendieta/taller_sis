import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsultasDisponibilidad1710000000020 implements MigrationInterface {
  name = 'ConsultasDisponibilidad1710000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE consultas_disponibilidad (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        consulta_id VARCHAR(100) NOT NULL,
        consulta_version INTEGER NOT NULL,
        orden_id BIGINT NOT NULL,
        request_event_id UUID NOT NULL,
        correlation_id UUID NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        response_event_id UUID,
        vigente_en TIMESTAMPTZ,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_consultas_disponibilidad_orden
          FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
        CONSTRAINT uq_consultas_disponibilidad_consulta_id UNIQUE (consulta_id),
        CONSTRAINT uq_consultas_disponibilidad_request_event_id UNIQUE (request_event_id),
        CONSTRAINT uq_consultas_disponibilidad_response_event_id UNIQUE (response_event_id),
        CONSTRAINT uq_consultas_disponibilidad_orden_version UNIQUE (orden_id, consulta_version),
        CONSTRAINT ck_consultas_disponibilidad_version CHECK (consulta_version > 0),
        CONSTRAINT ck_consultas_disponibilidad_estado CHECK (estado IN ('PENDIENTE', 'RESPONDIDA')),
        CONSTRAINT ck_consultas_disponibilidad_respuesta CHECK (
          (estado = 'PENDIENTE' AND response_event_id IS NULL AND vigente_en IS NULL)
          OR (estado = 'RESPONDIDA' AND response_event_id IS NOT NULL AND vigente_en IS NOT NULL)
        )
      );
    `);
    await queryRunner.query(`
      CREATE INDEX ix_consultas_disponibilidad_orden_estado
        ON consultas_disponibilidad (orden_id, estado, consulta_version DESC);
    `);
    await queryRunner.query(`
      CREATE TABLE consulta_disponibilidad_items (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        consulta_disponibilidad_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        material_codigo VARCHAR(80) NOT NULL,
        material_nombre VARCHAR(160) NOT NULL,
        cantidad_requerida NUMERIC(14,4) NOT NULL,
        cantidad_disponible NUMERIC(14,4),
        unidad VARCHAR(30) NOT NULL,
        estado VARCHAR(20),
        CONSTRAINT fk_consulta_disponibilidad_items_consulta
          FOREIGN KEY (consulta_disponibilidad_id) REFERENCES consultas_disponibilidad(id) ON DELETE CASCADE,
        CONSTRAINT fk_consulta_disponibilidad_items_material
          FOREIGN KEY (material_id) REFERENCES materiales(id) ON DELETE RESTRICT,
        CONSTRAINT uq_consulta_disponibilidad_item_material
          UNIQUE (consulta_disponibilidad_id, material_id),
        CONSTRAINT ck_consulta_disponibilidad_item_cantidades CHECK (
          cantidad_requerida > 0 AND cantidad_disponible >= 0
        ),
        CONSTRAINT ck_consulta_disponibilidad_item_estado CHECK (
          estado IS NULL OR estado IN ('SUFICIENTE', 'INSUFICIENTE', 'FALTANTE')
        ),
        CONSTRAINT ck_consulta_disponibilidad_item_respuesta CHECK (
          (estado IS NULL AND cantidad_disponible IS NULL)
          OR (estado IS NOT NULL AND cantidad_disponible IS NOT NULL)
        )
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE consulta_disponibilidad_items;');
    await queryRunner.query('DROP TABLE consultas_disponibilidad;');
  }
}
