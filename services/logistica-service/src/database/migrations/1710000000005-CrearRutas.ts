import { MigrationInterface, QueryRunner } from 'typeorm';

export class CrearRutas1710000000005 implements MigrationInterface {
  name = 'CrearRutas1710000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE rutas (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        grupo_id BIGINT NULL,
        fecha_programada DATE NOT NULL,
        vehiculo_externo_id VARCHAR(80) NOT NULL,
        chofer_externo_id VARCHAR(80) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'PLANIFICADA',
        responsable_usuario_id BIGINT NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_ruta_estado CHECK (estado IN ('PLANIFICADA','DESPACHADA','COMPLETADA','CANCELADA')),
        CONSTRAINT ck_ruta_vehiculo CHECK (LENGTH(BTRIM(vehiculo_externo_id)) > 0),
        CONSTRAINT ck_ruta_chofer CHECK (LENGTH(BTRIM(chofer_externo_id)) > 0),
        CONSTRAINT ck_ruta_grupo CHECK (grupo_id IS NULL OR grupo_id > 0),
        CONSTRAINT ck_ruta_responsable CHECK (responsable_usuario_id > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_rutas_grupo ON rutas (grupo_id);');
    await queryRunner.query('CREATE INDEX ix_rutas_fecha_programada ON rutas (fecha_programada);');
    await queryRunner.query(`
      CREATE TABLE rutas_paradas (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ruta_id BIGINT NOT NULL,
        secuencia INTEGER NOT NULL,
        destino VARCHAR(250) NOT NULL,
        CONSTRAINT fk_ruta_parada_ruta FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE,
        CONSTRAINT uq_ruta_parada_secuencia UNIQUE (ruta_id, secuencia),
        CONSTRAINT ck_ruta_parada_secuencia CHECK (secuencia > 0),
        CONSTRAINT ck_ruta_parada_destino CHECK (LENGTH(BTRIM(destino)) > 0)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE rutas_paradas_boletas (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        parada_id BIGINT NOT NULL,
        boleta_id BIGINT NOT NULL,
        CONSTRAINT fk_ruta_parada_boleta_parada FOREIGN KEY (parada_id)
          REFERENCES rutas_paradas(id) ON DELETE CASCADE,
        CONSTRAINT fk_ruta_parada_boleta_boleta FOREIGN KEY (boleta_id)
          REFERENCES boletas_envio(id) ON DELETE RESTRICT,
        CONSTRAINT uq_ruta_parada_boleta UNIQUE (parada_id, boleta_id)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_rutas_paradas_boletas_boleta ON rutas_paradas_boletas (boleta_id);');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE rutas_paradas_boletas;');
    await queryRunner.query('DROP TABLE rutas_paradas;');
    await queryRunner.query('DROP TABLE rutas;');
  }
}
