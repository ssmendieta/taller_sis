import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-380: incidencias de transporte e historial de reprogramaciones de rutas.
// Las filas no se borran: ruta e incidencia usan RESTRICT. Si una ruta
// PLANIFICADA reemplaza sus paradas (ABC-370), la incidencia se conserva y solo
// pierde el enlace a la parada borrada (SET NULL de parada_id, PostgreSQL 15+).
export class CrearIncidenciasTransporte1710000000009 implements MigrationInterface {
  name = 'CrearIncidenciasTransporte1710000000009';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Permite exigir que la parada de una incidencia pertenezca a su ruta.
    await queryRunner.query('ALTER TABLE rutas_paradas ADD CONSTRAINT uq_ruta_parada_id_ruta UNIQUE (id, ruta_id);');
    await queryRunner.query(`
      CREATE TABLE incidencias_transporte (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ruta_id BIGINT NOT NULL,
        parada_id BIGINT NULL,
        tipo VARCHAR(30) NOT NULL,
        motivo VARCHAR(500) NOT NULL,
        registrada_por_usuario_id BIGINT NOT NULL,
        registrada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_incidencia_transporte_ruta FOREIGN KEY (ruta_id)
          REFERENCES rutas(id) ON DELETE RESTRICT,
        CONSTRAINT fk_incidencia_transporte_parada FOREIGN KEY (parada_id, ruta_id)
          REFERENCES rutas_paradas(id, ruta_id) ON DELETE SET NULL (parada_id),
        CONSTRAINT uq_incidencia_transporte_id_ruta UNIQUE (id, ruta_id),
        CONSTRAINT ck_incidencia_transporte_tipo CHECK (
          tipo IN ('RETRASO','AVERIA_VEHICULO','CLIENTE_AUSENTE','DIRECCION_INCORRECTA','CARGA_DANADA','OTRO')
        ),
        CONSTRAINT ck_incidencia_transporte_motivo CHECK (LENGTH(BTRIM(motivo)) > 0),
        CONSTRAINT ck_incidencia_transporte_autor CHECK (registrada_por_usuario_id > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_incidencias_transporte_ruta ON incidencias_transporte (ruta_id, registrada_en);');
    await queryRunner.query('CREATE INDEX ix_incidencias_transporte_parada ON incidencias_transporte (parada_id);');
    await queryRunner.query(`
      CREATE TABLE rutas_reprogramaciones (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ruta_id BIGINT NOT NULL,
        incidencia_id BIGINT NULL,
        fecha_anterior DATE NOT NULL,
        fecha_nueva DATE NOT NULL,
        motivo VARCHAR(500) NOT NULL,
        registrada_por_usuario_id BIGINT NOT NULL,
        registrada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_ruta_reprogramacion_ruta FOREIGN KEY (ruta_id)
          REFERENCES rutas(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ruta_reprogramacion_incidencia FOREIGN KEY (incidencia_id, ruta_id)
          REFERENCES incidencias_transporte(id, ruta_id) ON DELETE RESTRICT,
        CONSTRAINT ck_ruta_reprogramacion_fechas CHECK (fecha_nueva <> fecha_anterior),
        CONSTRAINT ck_ruta_reprogramacion_motivo CHECK (LENGTH(BTRIM(motivo)) > 0),
        CONSTRAINT ck_ruta_reprogramacion_autor CHECK (registrada_por_usuario_id > 0)
      );
    `);
    await queryRunner.query('CREATE INDEX ix_rutas_reprogramaciones_ruta ON rutas_reprogramaciones (ruta_id, id);');
    await queryRunner.query('CREATE INDEX ix_rutas_reprogramaciones_incidencia ON rutas_reprogramaciones (incidencia_id);');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE rutas_reprogramaciones;');
    await queryRunner.query('DROP TABLE incidencias_transporte;');
    await queryRunner.query('ALTER TABLE rutas_paradas DROP CONSTRAINT uq_ruta_parada_id_ruta;');
  }
}
