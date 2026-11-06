import { MigrationInterface, QueryRunner } from 'typeorm';

export class Reprocesos1710000000027 implements MigrationInterface {
  name = 'Reprocesos1710000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE reprocesos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        resultado_calidad_id BIGINT NOT NULL,
        cantidad_procesada NUMERIC(14,4) NOT NULL,
        cantidad_recuperada NUMERIC(14,4) NOT NULL,
        cantidad_descartada NUMERIC(14,4) NOT NULL,
        autor_usuario_id BIGINT NOT NULL,
        fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_reproceso_orden FOREIGN KEY (orden_id)
          REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
        CONSTRAINT fk_reproceso_resultado_calidad FOREIGN KEY (resultado_calidad_id)
          REFERENCES resultados_conformes(id) ON DELETE RESTRICT,
        CONSTRAINT ck_reproceso_cantidades_no_negativas CHECK (
          cantidad_procesada >= 0 AND cantidad_procesada <> 'NaN'::numeric AND
          cantidad_recuperada >= 0 AND cantidad_recuperada <> 'NaN'::numeric AND
          cantidad_descartada >= 0 AND cantidad_descartada <> 'NaN'::numeric
        ),
        CONSTRAINT ck_reproceso_balance_cantidades CHECK (
          cantidad_recuperada + cantidad_descartada = cantidad_procesada
        ),
        CONSTRAINT ck_reproceso_autor CHECK (autor_usuario_id > 0)
      );
    `);
    await queryRunner.query(`CREATE INDEX ix_reprocesos_orden_fecha ON reprocesos (orden_id, fecha_hora);`);
    await queryRunner.query(`CREATE INDEX ix_reprocesos_resultado_calidad ON reprocesos (resultado_calidad_id);`);
    await queryRunner.query(`
      CREATE FUNCTION validar_reproceso_resultado_calidad() RETURNS TRIGGER AS $$
      DECLARE
        resultado_orden_id BIGINT;
        resultado_tipo VARCHAR(20);
      BEGIN
        SELECT orden_id, tipo
          INTO resultado_orden_id, resultado_tipo
          FROM resultados_conformes
         WHERE id = NEW.resultado_calidad_id;

        IF resultado_orden_id IS NULL THEN
          RAISE EXCEPTION 'El resultado de calidad % no existe', NEW.resultado_calidad_id
            USING ERRCODE = '23503';
        END IF;

        IF resultado_tipo <> 'DEFECTUOSO' THEN
          RAISE EXCEPTION 'El reproceso requiere un resultado de calidad DEFECTUOSO'
            USING ERRCODE = '23514';
        END IF;

        IF resultado_orden_id <> NEW.orden_id THEN
          RAISE EXCEPTION 'La orden del reproceso no coincide con la del resultado de calidad'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER tr_reproceso_resultado_calidad
      BEFORE INSERT OR UPDATE OF orden_id, resultado_calidad_id ON reprocesos
      FOR EACH ROW EXECUTE FUNCTION validar_reproceso_resultado_calidad();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE reprocesos;`);
    await queryRunner.query(`DROP FUNCTION validar_reproceso_resultado_calidad();`);
  }
}
