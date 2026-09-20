import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthSchema1710000000000 implements MigrationInterface {
  name = 'AuthSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS roles (
          id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          nombre          VARCHAR(80) NOT NULL UNIQUE,
          descripcion     VARCHAR(255),
          activo          BOOLEAN NOT NULL DEFAULT TRUE,
          creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS permisos (
          id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          codigo          VARCHAR(120) NOT NULL UNIQUE,
          nombre          VARCHAR(120) NOT NULL,
          descripcion     VARCHAR(255),
          activo          BOOLEAN NOT NULL DEFAULT TRUE,
          creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rol_permiso (
          rol_id          BIGINT NOT NULL,
          permiso_id      BIGINT NOT NULL,
          PRIMARY KEY (rol_id, permiso_id),
          CONSTRAINT fk_rol_permiso_rol
              FOREIGN KEY (rol_id)
              REFERENCES roles(id),
          CONSTRAINT fk_rol_permiso_permiso
              FOREIGN KEY (permiso_id)
              REFERENCES permisos(id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
          id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          nombre_completo     VARCHAR(150) NOT NULL,
          correo              VARCHAR(255) NOT NULL,
          password_hash       TEXT NOT NULL,
          rol_id              BIGINT NOT NULL,
          activo              BOOLEAN NOT NULL DEFAULT TRUE,
          eliminado_en        TIMESTAMPTZ,
          creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT fk_usuario_rol
              FOREIGN KEY (rol_id)
              REFERENCES roles(id)
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_correo_ci
          ON usuarios (LOWER(correo));
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_usuarios_rol_id ON usuarios (rol_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_usuarios_activo ON usuarios (activo);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS auditoria (
          id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          usuario_actor_id    BIGINT,
          accion              VARCHAR(120) NOT NULL,
          entidad             VARCHAR(120) NOT NULL,
          entidad_id          VARCHAR(100),
          usuario_afectado_id BIGINT,
          datos_antes         JSONB,
          datos_despues       JSONB,
          fecha_hora          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT fk_auditoria_actor
              FOREIGN KEY (usuario_actor_id)
              REFERENCES usuarios(id),
          CONSTRAINT fk_auditoria_afectado
              FOREIGN KEY (usuario_afectado_id)
              REFERENCES usuarios(id)
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_auditoria_actor ON auditoria (usuario_actor_id, fecha_hora DESC);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_auditoria_afectado ON auditoria (usuario_afectado_id, fecha_hora DESC);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_auditoria_accion ON auditoria (accion, fecha_hora DESC);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ix_auditoria_entidad ON auditoria (entidad, entidad_id, fecha_hora DESC);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS auditoria CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS usuarios CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS rol_permiso CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS permisos CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles CASCADE;`);
  }
}
