import { MigrationInterface, QueryRunner } from 'typeorm';

export class ObservacionesOrden1710000000023 implements MigrationInterface {
  name = 'ObservacionesOrden1710000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE observaciones_orden (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        orden_id BIGINT NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        descripcion VARCHAR(1000) NOT NULL,
        autor_usuario_id BIGINT NOT NULL,
        autor_nombre VARCHAR(150) NULL,
        fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_observacion_orden_orden FOREIGN KEY (orden_id)
          REFERENCES ordenes_produccion(id) ON DELETE RESTRICT,
        CONSTRAINT ck_observacion_orden_tipo CHECK (tipo IN ('OBSERVACION','INCIDENCIA')),
        CONSTRAINT ck_observacion_orden_descripcion CHECK (LENGTH(BTRIM(descripcion)) > 0),
        CONSTRAINT ck_observacion_orden_autor CHECK (autor_usuario_id > 0)
      );
    `);
    await queryRunner.query(
      'CREATE INDEX ix_observaciones_orden_fecha ON observaciones_orden (orden_id, fecha_hora, id);',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE observaciones_orden;');
  }
}
