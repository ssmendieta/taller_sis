import { MigrationInterface, QueryRunner } from 'typeorm';

export class HistorialBoletasEnvio1710000000004 implements MigrationInterface {
  name = 'HistorialBoletasEnvio1710000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE boletas_envio_historial (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        boleta_id BIGINT NOT NULL,
        estado_anterior VARCHAR(20) NOT NULL,
        estado_nuevo VARCHAR(20) NOT NULL,
        usuario_actor_id BIGINT NOT NULL,
        motivo VARCHAR(500) NOT NULL,
        fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_boleta_envio_historial_boleta FOREIGN KEY (boleta_id)
          REFERENCES boletas_envio(id) ON DELETE RESTRICT,
        CONSTRAINT ck_boleta_envio_historial_estado_anterior CHECK (estado_anterior IN ('BORRADOR','EMITIDA','ANULADA')),
        CONSTRAINT ck_boleta_envio_historial_estado_nuevo CHECK (estado_nuevo IN ('BORRADOR','EMITIDA','ANULADA')),
        CONSTRAINT ck_boleta_envio_historial_actor CHECK (usuario_actor_id > 0),
        CONSTRAINT ck_boleta_envio_historial_motivo CHECK (LENGTH(BTRIM(motivo)) > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_boletas_envio_historial_boleta ON boletas_envio_historial (boleta_id);');
    await queryRunner.query('CREATE INDEX ix_boletas_envio_historial_fecha ON boletas_envio_historial (fecha_hora DESC);');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE boletas_envio_historial;');
  }
}
