import { MigrationInterface, QueryRunner } from 'typeorm';

export class DemandasRechazadas1710000000025 implements MigrationInterface {
  name = 'DemandasRechazadas1710000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE demandas_rechazadas (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        event_id UUID NULL,
        origen VARCHAR(20) NULL,
        demanda_externa_id VARCHAR(80) NULL,
        motivo VARCHAR(40) NOT NULL,
        detalle VARCHAR(1000) NOT NULL,
        payload JSONB NULL,
        message_id VARCHAR(255) NULL,
        recibido_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_demanda_rechazada_motivo CHECK (
          motivo IN ('EVENTO_INVALIDO','EVENTO_CONTRADICTORIO','DEMANDA_CONTRADICTORIA')
        )
      );
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_demanda_rechazada_event_id ON demandas_rechazadas (event_id) WHERE event_id IS NOT NULL;',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE demandas_rechazadas;');
  }
}
