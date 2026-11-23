import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-453: hora real de entrega de cada parada (la fija el servidor al entregar).
// Las paradas ya entregadas toman la hora en que se registró su entrega.
export class HoraRealEntregaParada1710000000016 implements MigrationInterface {
  name = 'HoraRealEntregaParada1710000000016';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE rutas_paradas ADD COLUMN entregada_en TIMESTAMPTZ NULL;');
    await queryRunner.query(`
      UPDATE rutas_paradas SET entregada_en = entrega_actualizada_en
       WHERE estado_entrega = 'ENTREGADA';
    `);
    await queryRunner.query(`
      ALTER TABLE rutas_paradas ADD CONSTRAINT ck_ruta_parada_entregada_en
        CHECK (entregada_en IS NULL OR estado_entrega = 'ENTREGADA');
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE rutas_paradas DROP CONSTRAINT ck_ruta_parada_entregada_en;');
    await queryRunner.query('ALTER TABLE rutas_paradas DROP COLUMN entregada_en;');
  }
}
