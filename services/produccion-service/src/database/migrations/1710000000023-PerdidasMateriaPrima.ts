import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-74: pérdidas (mermas) de materia prima por orden. Relaciones dentro de la
// base de Producción; el autor viene de Auth y solo se valida que sea positivo.
export class PerdidasMateriaPrima1710000000023 implements MigrationInterface {
  name = 'PerdidasMateriaPrima1710000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE perdidas_materia_prima (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        material_id BIGINT NOT NULL,
        cantidad NUMERIC(14,4) NOT NULL,
        unidad VARCHAR(40) NOT NULL,
        motivo VARCHAR(500) NOT NULL,
        autor_usuario_id BIGINT NOT NULL,
        fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_perdida_mp_orden FOREIGN KEY (orden_id)
          REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
        CONSTRAINT fk_perdida_mp_material FOREIGN KEY (material_id)
          REFERENCES materiales(id) ON DELETE RESTRICT,
        CONSTRAINT ck_perdida_mp_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
        CONSTRAINT ck_perdida_mp_unidad
          CHECK (unidad IN ('kg','g','l','ml','m','cm','unidad','docena','caja','paquete')),
        CONSTRAINT ck_perdida_mp_motivo CHECK (LENGTH(BTRIM(motivo)) > 0),
        CONSTRAINT ck_perdida_mp_autor CHECK (autor_usuario_id > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_perdidas_mp_orden ON perdidas_materia_prima (orden_id);');
    await queryRunner.query('CREATE INDEX ix_perdidas_mp_material ON perdidas_materia_prima (material_id);');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE perdidas_materia_prima;');
  }
}
