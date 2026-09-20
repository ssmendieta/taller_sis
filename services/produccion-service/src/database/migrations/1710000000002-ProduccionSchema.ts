import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProduccionSchema1710000000002 implements MigrationInterface {
  name = 'ProduccionSchema1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS materiales (
          id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          codigo              VARCHAR(80) NOT NULL UNIQUE,
          nombre              VARCHAR(150) NOT NULL,
          unidad_medida       VARCHAR(40) NOT NULL,
          activo              BOOLEAN NOT NULL DEFAULT TRUE,
          creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS recetas (
          id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          producto_codigo     VARCHAR(80) NOT NULL,
          producto_nombre     VARCHAR(150) NOT NULL,
          activa              BOOLEAN NOT NULL DEFAULT TRUE,
          creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_receta_producto_activa ON recetas (producto_codigo) WHERE activa = TRUE;`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_recetas_producto ON recetas (producto_codigo);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS receta_material (
          receta_id           BIGINT NOT NULL,
          material_id         BIGINT NOT NULL,
          cantidad_requerida  NUMERIC(14,4) NOT NULL,
          PRIMARY KEY (receta_id, material_id),
          CONSTRAINT fk_receta_material_receta FOREIGN KEY (receta_id) REFERENCES recetas(id) ON DELETE RESTRICT,
          CONSTRAINT fk_receta_material_material FOREIGN KEY (material_id) REFERENCES materiales(id) ON DELETE RESTRICT,
          CONSTRAINT ck_receta_material_cantidad CHECK (cantidad_requerida > 0)
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_receta_material_material ON receta_material (material_id);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ordenes_produccion (
          id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          codigo                  VARCHAR(40) NOT NULL UNIQUE,
          receta_id               BIGINT NOT NULL,
          cantidad_solicitada     NUMERIC(14,4) NOT NULL,
          fecha_programada        DATE NOT NULL,
          estado                  VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
          responsable_usuario_id  BIGINT NOT NULL,
          iniciada_en             TIMESTAMPTZ,
          finalizada_en           TIMESTAMPTZ,
          cancelada_en            TIMESTAMPTZ,
          creado_en               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT fk_orden_receta FOREIGN KEY (receta_id) REFERENCES recetas(id) ON DELETE RESTRICT,
          CONSTRAINT ck_orden_cantidad CHECK (cantidad_solicitada > 0),
          CONSTRAINT ck_orden_estado CHECK (estado IN ('PENDIENTE','PLANIFICADA','EN_PRODUCCION','FINALIZADA','CANCELADA'))
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_ordenes_estado ON ordenes_produccion (estado);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_ordenes_fecha_programada ON ordenes_produccion (fecha_programada);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_ordenes_receta ON ordenes_produccion (receta_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_ordenes_responsable ON ordenes_produccion (responsable_usuario_id);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS historial_estado_orden (
          id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          orden_id                BIGINT NOT NULL,
          estado_anterior         VARCHAR(20),
          estado_nuevo            VARCHAR(20) NOT NULL,
          usuario_responsable_id  BIGINT NOT NULL,
          fecha_hora              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          motivo                  VARCHAR(500),
          CONSTRAINT fk_historial_orden FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
          CONSTRAINT ck_historial_estado_anterior CHECK (estado_anterior IS NULL OR estado_anterior IN ('PENDIENTE','PLANIFICADA','EN_PRODUCCION','FINALIZADA','CANCELADA')),
          CONSTRAINT ck_historial_estado_nuevo CHECK (estado_nuevo IN ('PENDIENTE','PLANIFICADA','EN_PRODUCCION','FINALIZADA','CANCELADA'))
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_historial_orden_fecha ON historial_estado_orden (orden_id, fecha_hora DESC);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_historial_usuario ON historial_estado_orden (usuario_responsable_id, fecha_hora DESC);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS avances_produccion (
          id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          orden_id                BIGINT NOT NULL,
          cantidad_producida     NUMERIC(14,4) NOT NULL,
          fecha_hora              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          usuario_responsable_id  BIGINT NOT NULL,
          CONSTRAINT fk_avance_orden FOREIGN KEY (orden_id) REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
          CONSTRAINT ck_avance_cantidad CHECK (cantidad_producida > 0)
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_avance_orden_fecha ON avances_produccion (orden_id, fecha_hora DESC);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_avance_usuario ON avances_produccion (usuario_responsable_id, fecha_hora DESC);`);

    await queryRunner.query(`
      CREATE OR REPLACE VIEW vw_orden_materiales_requeridos AS
      SELECT
          o.id AS orden_id,
          o.codigo AS orden_codigo,
          o.cantidad_solicitada,
          r.id AS receta_id,
          r.producto_codigo,
          r.producto_nombre,
          m.id AS material_id,
          m.codigo AS material_codigo,
          m.nombre AS material_nombre,
          m.unidad_medida,
          (rm.cantidad_requerida * o.cantidad_solicitada) AS cantidad_requerida
      FROM ordenes_produccion o
      JOIN recetas r ON r.id = o.receta_id
      JOIN receta_material rm ON rm.receta_id = r.id
      JOIN materiales m ON m.id = rm.material_id;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE VIEW vw_orden_avance AS
      SELECT
          o.id AS orden_id,
          o.codigo AS orden_codigo,
          o.cantidad_solicitada,
          COALESCE(SUM(a.cantidad_producida), 0) AS cantidad_producida_acumulada,
          GREATEST(o.cantidad_solicitada - COALESCE(SUM(a.cantidad_producida), 0), 0) AS cantidad_pendiente
      FROM ordenes_produccion o
      LEFT JOIN avances_produccion a ON a.orden_id = o.id
      GROUP BY o.id, o.codigo, o.cantidad_solicitada;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS vw_orden_avance;`);
    await queryRunner.query(`DROP VIEW IF EXISTS vw_orden_materiales_requeridos;`);
    await queryRunner.query(`DROP TABLE IF EXISTS avances_produccion CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS historial_estado_orden CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ordenes_produccion CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS receta_material CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS recetas CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS materiales CASCADE;`);
  }
}
