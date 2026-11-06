import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-376: observación opcional del despacho de la ruta y de la entrega de cada
// parada. Fecha y autor ya existen desde ABC-375 y los fija el servidor.
export class ObservacionesDespachoEntrega1710000000008 implements MigrationInterface {
  name = 'ObservacionesDespachoEntrega1710000000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rutas
        ADD COLUMN despacho_observacion VARCHAR(500) NULL,
        ADD CONSTRAINT ck_ruta_despacho_observacion CHECK (
          despacho_observacion IS NULL
          OR (despachada_en IS NOT NULL AND LENGTH(BTRIM(despacho_observacion)) > 0)
        );
    `);
    await queryRunner.query(`
      ALTER TABLE rutas_paradas
        ADD COLUMN entrega_observacion VARCHAR(500) NULL,
        ADD CONSTRAINT ck_ruta_parada_entrega_observacion CHECK (
          entrega_observacion IS NULL
          OR (estado_entrega <> 'PENDIENTE' AND LENGTH(BTRIM(entrega_observacion)) > 0)
        );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rutas_paradas
        DROP CONSTRAINT ck_ruta_parada_entrega_observacion,
        DROP COLUMN entrega_observacion;
    `);
    await queryRunner.query(`
      ALTER TABLE rutas
        DROP CONSTRAINT ck_ruta_despacho_observacion,
        DROP COLUMN despacho_observacion;
    `);
  }
}
