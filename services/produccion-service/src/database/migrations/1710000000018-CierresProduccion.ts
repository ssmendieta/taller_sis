import { MigrationInterface, QueryRunner } from 'typeorm';

export class CierresProduccion1710000000018 implements MigrationInterface {
  name = 'CierresProduccion1710000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE cierres_produccion (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        cierre_version INTEGER NOT NULL DEFAULT 1,
        orden_codigo VARCHAR(50) NOT NULL,
        producto JSONB NOT NULL,
        cantidad_solicitada NUMERIC(14,4) NOT NULL,
        cantidad_producida NUMERIC(14,4) NOT NULL,
        cantidad_conforme NUMERIC(14,4) NOT NULL,
        cantidad_defectuosa NUMERIC(14,4) NOT NULL,
        consumos JSONB NOT NULL DEFAULT '[]'::jsonb,
        finalizada_at TIMESTAMPTZ NOT NULL,
        fecha_cierre TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_cierre_produccion_orden FOREIGN KEY (orden_id)
          REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
        CONSTRAINT uq_cierres_produccion_orden_version UNIQUE (orden_id, cierre_version),
        CONSTRAINT ck_cierre_produccion_version CHECK (cierre_version > 0),
        CONSTRAINT ck_cierre_produccion_cantidades CHECK (
          cantidad_solicitada > 0 AND cantidad_solicitada <> 'NaN'::numeric AND
          cantidad_producida >= 0 AND cantidad_producida <> 'NaN'::numeric AND
          cantidad_conforme >= 0 AND cantidad_conforme <> 'NaN'::numeric AND
          cantidad_defectuosa >= 0 AND cantidad_defectuosa <> 'NaN'::numeric
        ),
        CONSTRAINT ck_cierre_produccion_clasificado
          CHECK (cantidad_conforme + cantidad_defectuosa <= cantidad_producida),
        CONSTRAINT ck_cierre_produccion_consumos CHECK (jsonb_typeof(consumos) = 'array'),
        CONSTRAINT ck_cierre_produccion_producto CHECK (jsonb_typeof(producto) = 'object')
      );
    `);
    await queryRunner.query(`
      CREATE FUNCTION validar_orden_cierre_produccion() RETURNS trigger
      LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
      DECLARE estado_orden VARCHAR; fecha_finalizacion TIMESTAMPTZ;
      BEGIN
        SELECT estado, finalizada_en INTO estado_orden, fecha_finalizacion
        FROM ordenes_produccion WHERE id = NEW.orden_id FOR SHARE;
        IF FOUND AND (estado_orden <> 'FINALIZADA' OR fecha_finalizacion IS NULL) THEN
          RAISE EXCEPTION 'El cierre requiere una orden FINALIZADA con fecha de finalización'
            USING ERRCODE = '23514', CONSTRAINT = 'ck_cierre_produccion_orden_finalizada';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_cierre_produccion_orden_finalizada
      BEFORE INSERT ON cierres_produccion
      FOR EACH ROW EXECUTE FUNCTION validar_orden_cierre_produccion();
    `);
    await queryRunner.query(`
      CREATE FUNCTION impedir_cambios_cierre_produccion() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'El snapshot de cierre de producción es inmutable'
          USING ERRCODE = '55000';
      END;
      $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_cierre_produccion_inmutable
      BEFORE UPDATE OR DELETE ON cierres_produccion
      FOR EACH ROW EXECUTE FUNCTION impedir_cambios_cierre_produccion();
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_cierre_produccion_no_truncate
      BEFORE TRUNCATE ON cierres_produccion
      FOR EACH STATEMENT EXECUTE FUNCTION impedir_cambios_cierre_produccion();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE cierres_produccion;');
    await queryRunner.query('DROP FUNCTION impedir_cambios_cierre_produccion();');
    await queryRunner.query('DROP FUNCTION validar_orden_cierre_produccion();');
  }
}
