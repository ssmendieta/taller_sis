import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-443 (ABC-412): relación opcional entre orden de producción y demanda.
export class RelacionOrdenDemanda1710000000032 implements MigrationInterface {
  name = 'RelacionOrdenDemanda1710000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ordenes_produccion
        ADD COLUMN demanda_id BIGINT NULL,
        ADD CONSTRAINT fk_orden_demanda FOREIGN KEY (demanda_id) REFERENCES demandas(id) ON DELETE RESTRICT;
    `);
    await queryRunner.query('CREATE INDEX ix_ordenes_demanda ON ordenes_produccion (demanda_id);');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS ix_ordenes_demanda;');
    await queryRunner.query('ALTER TABLE ordenes_produccion DROP CONSTRAINT IF EXISTS fk_orden_demanda;');
    await queryRunner.query('ALTER TABLE ordenes_produccion DROP COLUMN IF EXISTS demanda_id;');
  }
}
