import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-524: diferencia en minutos con la hora programada y motivo del retraso,
// guardados junto a la entrega de la parada.
export class RetrasoEntregaParada1710000000017 implements MigrationInterface {
  name = 'RetrasoEntregaParada1710000000017';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rutas_paradas
        ADD COLUMN diferencia_minutos INTEGER NULL,
        ADD COLUMN motivo_retraso VARCHAR(500) NULL,
        ADD CONSTRAINT ck_ruta_parada_diferencia_minutos
          CHECK (diferencia_minutos IS NULL OR estado_entrega = 'ENTREGADA'),
        ADD CONSTRAINT ck_ruta_parada_motivo_retraso
          CHECK (motivo_retraso IS NULL OR (estado_entrega = 'ENTREGADA' AND LENGTH(BTRIM(motivo_retraso)) > 0));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rutas_paradas
        DROP CONSTRAINT ck_ruta_parada_motivo_retraso,
        DROP CONSTRAINT ck_ruta_parada_diferencia_minutos,
        DROP COLUMN motivo_retraso,
        DROP COLUMN diferencia_minutos;
    `);
  }
}
