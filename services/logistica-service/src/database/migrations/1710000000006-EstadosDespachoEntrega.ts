import { MigrationInterface, QueryRunner } from 'typeorm';

// ABC-375: agrega solo los campos de estado, fecha y autor que faltaban para
// el despacho de la ruta y la entrega de cada parada.
export class EstadosDespachoEntrega1710000000006 implements MigrationInterface {
  name = 'EstadosDespachoEntrega1710000000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rutas
        ADD COLUMN despachada_en TIMESTAMPTZ NULL,
        ADD COLUMN despachada_por_usuario_id BIGINT NULL,
        ADD COLUMN completada_en TIMESTAMPTZ NULL,
        ADD CONSTRAINT ck_ruta_despacho_autor CHECK (
          (despachada_en IS NULL AND despachada_por_usuario_id IS NULL)
          OR (despachada_en IS NOT NULL AND despachada_por_usuario_id > 0)
        ),
        ADD CONSTRAINT ck_ruta_despacho_estado CHECK (
          estado NOT IN ('DESPACHADA','COMPLETADA') OR despachada_en IS NOT NULL
        ),
        ADD CONSTRAINT ck_ruta_completada_fecha CHECK (
          (estado = 'COMPLETADA') = (completada_en IS NOT NULL)
        );
    `);
    await queryRunner.query(`
      ALTER TABLE rutas_paradas
        ADD COLUMN estado_entrega VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        ADD COLUMN entrega_actualizada_en TIMESTAMPTZ NULL,
        ADD COLUMN entrega_usuario_id BIGINT NULL,
        ADD CONSTRAINT ck_ruta_parada_estado_entrega CHECK (
          estado_entrega IN ('PENDIENTE','ENTREGADA','ANULADA')
        ),
        ADD CONSTRAINT ck_ruta_parada_entrega_autor CHECK (
          estado_entrega = 'PENDIENTE'
          OR (entrega_actualizada_en IS NOT NULL AND entrega_usuario_id > 0)
        );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rutas_paradas
        DROP CONSTRAINT ck_ruta_parada_entrega_autor,
        DROP CONSTRAINT ck_ruta_parada_estado_entrega,
        DROP COLUMN entrega_usuario_id,
        DROP COLUMN entrega_actualizada_en,
        DROP COLUMN estado_entrega;
    `);
    await queryRunner.query(`
      ALTER TABLE rutas
        DROP CONSTRAINT ck_ruta_completada_fecha,
        DROP CONSTRAINT ck_ruta_despacho_estado,
        DROP CONSTRAINT ck_ruta_despacho_autor,
        DROP COLUMN completada_en,
        DROP COLUMN despachada_por_usuario_id,
        DROP COLUMN despachada_en;
    `);
  }
}
