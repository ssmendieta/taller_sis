import { MigrationInterface, QueryRunner } from 'typeorm';

export class DisponibilidadReintentos1710000000022 implements MigrationInterface {
  name = 'DisponibilidadReintentos1710000000022';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultas_disponibilidad
      ADD COLUMN error_respuesta VARCHAR(500),
      ADD COLUMN respuesta_esperada_hasta TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '20 seconds'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultas_disponibilidad
      DROP COLUMN respuesta_esperada_hasta, DROP COLUMN error_respuesta`);
  }
}
