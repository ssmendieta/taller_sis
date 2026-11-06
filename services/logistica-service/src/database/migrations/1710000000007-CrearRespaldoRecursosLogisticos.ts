import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-352: creación de tablas para la copia local de respaldo y sincronización
// de vehículos y choferes del ERP de recursos logísticos (ABC-115).
export class CrearRespaldoRecursosLogisticos1710000000007 implements MigrationInterface {
  name = 'CrearRespaldoRecursosLogisticos1710000000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE recursos_externos_snapshots (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        fecha DATE NOT NULL,
        version VARCHAR(50) NOT NULL,
        generado_en TIMESTAMPTZ NOT NULL,
        sincronizado_en TIMESTAMPTZ NOT NULL,
        datos JSONB NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_recursos_snapshot_fecha UNIQUE (fecha)
      );
    `);
    await queryRunner.query(
      'CREATE INDEX ix_recursos_snapshot_fecha ON recursos_externos_snapshots (fecha);',
    );
    await queryRunner.query(
      'CREATE INDEX ix_recursos_snapshot_sincronizado_en ON recursos_externos_snapshots (sincronizado_en);',
    );

    await queryRunner.query(`
      CREATE TABLE recursos_externos_vehiculos (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        snapshot_id BIGINT NOT NULL,
        fecha DATE NOT NULL,
        id_externo VARCHAR(80) NOT NULL,
        placa VARCHAR(20) NOT NULL,
        descripcion VARCHAR(120) NULL,
        capacidad_valor NUMERIC(14, 4) NOT NULL,
        capacidad_unidad VARCHAR(20) NOT NULL,
        disponible BOOLEAN NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_recurso_vehiculo_snapshot FOREIGN KEY (snapshot_id)
          REFERENCES recursos_externos_snapshots(id) ON DELETE CASCADE,
        CONSTRAINT uq_recurso_vehiculo_snapshot_ext UNIQUE (snapshot_id, id_externo),
        CONSTRAINT ck_recurso_vehiculo_id CHECK (LENGTH(BTRIM(id_externo)) > 0),
        CONSTRAINT ck_recurso_vehiculo_placa CHECK (LENGTH(BTRIM(placa)) > 0)
      );
    `);
    await queryRunner.query(
      'CREATE INDEX ix_recursos_vehiculos_id_externo ON recursos_externos_vehiculos (id_externo);',
    );
    await queryRunner.query(
      'CREATE INDEX ix_recursos_vehiculos_fecha ON recursos_externos_vehiculos (fecha);',
    );

    await queryRunner.query(`
      CREATE TABLE recursos_externos_choferes (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        snapshot_id BIGINT NOT NULL,
        fecha DATE NOT NULL,
        id_externo VARCHAR(80) NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        licencia_categoria VARCHAR(10) NULL,
        disponible BOOLEAN NOT NULL,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_recurso_chofer_snapshot FOREIGN KEY (snapshot_id)
          REFERENCES recursos_externos_snapshots(id) ON DELETE CASCADE,
        CONSTRAINT uq_recurso_chofer_snapshot_ext UNIQUE (snapshot_id, id_externo),
        CONSTRAINT ck_recurso_chofer_id CHECK (LENGTH(BTRIM(id_externo)) > 0),
        CONSTRAINT ck_recurso_chofer_nombre CHECK (LENGTH(BTRIM(nombre)) > 0)
      );
    `);
    await queryRunner.query(
      'CREATE INDEX ix_recursos_choferes_id_externo ON recursos_externos_choferes (id_externo);',
    );
    await queryRunner.query(
      'CREATE INDEX ix_recursos_choferes_fecha ON recursos_externos_choferes (fecha);',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS recursos_externos_choferes CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS recursos_externos_vehiculos CASCADE;');
    await queryRunner.query('DROP TABLE IF EXISTS recursos_externos_snapshots CASCADE;');
  }
}
