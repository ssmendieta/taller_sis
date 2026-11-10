import { MigrationInterface, QueryRunner } from 'typeorm';

export class CrearGruposSalida1710000000010 implements MigrationInterface {
  name = 'CrearGruposSalida1710000000010';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE grupos_salida (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        destino VARCHAR(250) NOT NULL,
        fecha_requerida DATE NOT NULL,
        tipo_carga VARCHAR(80) NOT NULL,
        unidad_carga VARCHAR(50) NOT NULL,
        creado_por_usuario_id BIGINT NOT NULL CHECK (creado_por_usuario_id > 0),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deshecho_por_usuario_id BIGINT CHECK (deshecho_por_usuario_id > 0),
        deshecho_en TIMESTAMPTZ,
        CHECK ((deshecho_por_usuario_id IS NULL) = (deshecho_en IS NULL))
      );
      CREATE TABLE grupos_salida_solicitudes (
        grupo_id BIGINT NOT NULL REFERENCES grupos_salida(id) ON DELETE RESTRICT,
        solicitud_id BIGINT NOT NULL REFERENCES solicitudes_salida(id) ON DELETE RESTRICT,
        liberada_en TIMESTAMPTZ,
        PRIMARY KEY (grupo_id, solicitud_id)
      );
      CREATE UNIQUE INDEX uq_grupo_solicitud_activa
        ON grupos_salida_solicitudes (solicitud_id) WHERE liberada_en IS NULL;
      SELECT setval(pg_get_serial_sequence('grupos_salida', 'id'), COALESCE(MAX(grupo_id), 1),
                    MAX(grupo_id) IS NOT NULL)
        FROM rutas;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE grupos_salida_solicitudes; DROP TABLE grupos_salida;');
  }
}
