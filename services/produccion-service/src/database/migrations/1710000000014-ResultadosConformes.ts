import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResultadosConformes1710000000014 implements MigrationInterface {
  name = 'ResultadosConformes1710000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE resultados_conformes (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        cantidad NUMERIC(14,4) NOT NULL,
        responsable_usuario_id BIGINT NOT NULL,
        fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_resultado_conforme_orden FOREIGN KEY (orden_id)
          REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
        CONSTRAINT ck_resultado_conforme_cantidad CHECK (cantidad > 0 AND cantidad <> 'NaN'::numeric),
        CONSTRAINT ck_resultado_conforme_responsable CHECK (responsable_usuario_id > 0)
      );
    `);
    await queryRunner.query(`CREATE INDEX ix_resultados_conformes_orden ON resultados_conformes (orden_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE resultados_conformes;`);
  }
}
