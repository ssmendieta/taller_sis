import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResultadoContableCierre1710000000021 implements MigrationInterface {
  name = 'ResultadoContableCierre1710000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cierres_produccion
        ADD COLUMN estado_contable VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        ADD COLUMN resultado_contable_event_id UUID,
        ADD COLUMN resultado_contable_en TIMESTAMPTZ,
        ADD COLUMN codigo_rechazo_contable VARCHAR(100),
        ADD COLUMN detalle_contable VARCHAR(500),
        ADD CONSTRAINT ck_cierre_estado_contable CHECK (estado_contable IN ('PENDIENTE', 'RECIBIDO', 'RECHAZADO')),
        ADD CONSTRAINT uq_cierre_resultado_contable_event UNIQUE (resultado_contable_event_id),
        ADD CONSTRAINT ck_cierre_resultado_contable_consistente CHECK (
          (estado_contable = 'PENDIENTE' AND resultado_contable_event_id IS NULL AND resultado_contable_en IS NULL)
          OR (estado_contable = 'RECIBIDO' AND resultado_contable_event_id IS NOT NULL AND resultado_contable_en IS NOT NULL AND codigo_rechazo_contable IS NULL)
          OR (estado_contable = 'RECHAZADO' AND resultado_contable_event_id IS NOT NULL AND resultado_contable_en IS NOT NULL AND codigo_rechazo_contable IS NOT NULL)
        );
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION impedir_cambios_cierre_produccion() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP <> 'UPDATE' OR ROW(
          OLD.id, OLD.orden_id, OLD.cierre_version, OLD.orden_codigo, OLD.producto,
          OLD.cantidad_solicitada, OLD.cantidad_producida, OLD.cantidad_conforme,
          OLD.cantidad_defectuosa, OLD.consumos, OLD.finalizada_at, OLD.fecha_cierre
        ) IS DISTINCT FROM ROW(
          NEW.id, NEW.orden_id, NEW.cierre_version, NEW.orden_codigo, NEW.producto,
          NEW.cantidad_solicitada, NEW.cantidad_producida, NEW.cantidad_conforme,
          NEW.cantidad_defectuosa, NEW.consumos, NEW.finalizada_at, NEW.fecha_cierre
        ) THEN
          RAISE EXCEPTION 'El snapshot de cierre de produccion es inmutable' USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION impedir_cambios_cierre_produccion() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'El snapshot de cierre de produccion es inmutable' USING ERRCODE = '55000';
      END;
      $$;
    `);
    await queryRunner.query(`
      ALTER TABLE cierres_produccion
        DROP CONSTRAINT ck_cierre_resultado_contable_consistente,
        DROP CONSTRAINT uq_cierre_resultado_contable_event,
        DROP CONSTRAINT ck_cierre_estado_contable,
        DROP COLUMN detalle_contable,
        DROP COLUMN codigo_rechazo_contable,
        DROP COLUMN resultado_contable_en,
        DROP COLUMN resultado_contable_event_id,
        DROP COLUMN estado_contable;
    `);
  }
}
