import { MigrationInterface, QueryRunner } from 'typeorm';

export class TipoResultadoCalidad1710000000015 implements MigrationInterface {
  name = 'TipoResultadoCalidad1710000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE resultados_conformes
        ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'CONFORME',
        ADD COLUMN causa_defecto VARCHAR(500),
        ADD CONSTRAINT ck_resultado_calidad_tipo CHECK (tipo IN ('CONFORME','DEFECTUOSO')),
        ADD CONSTRAINT ck_resultado_calidad_causa CHECK (
          (tipo = 'CONFORME' AND causa_defecto IS NULL) OR
          (tipo = 'DEFECTUOSO' AND causa_defecto IS NOT NULL AND LENGTH(BTRIM(causa_defecto)) > 0)
        );
    `);
    await queryRunner.query(`CREATE INDEX ix_resultados_calidad_orden_tipo ON resultados_conformes (orden_id, tipo);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM resultados_conformes WHERE tipo = 'DEFECTUOSO') THEN
          RAISE EXCEPTION 'No se puede revertir TipoResultadoCalidad mientras existan resultados defectuosos';
        END IF;
      END $$;
    `);
    await queryRunner.query(`DROP INDEX ix_resultados_calidad_orden_tipo;`);
    await queryRunner.query(`ALTER TABLE resultados_conformes
      DROP CONSTRAINT ck_resultado_calidad_causa,
      DROP CONSTRAINT ck_resultado_calidad_tipo,
      DROP COLUMN causa_defecto,
      DROP COLUMN tipo;`);
  }
}
