import { MigrationInterface, QueryRunner } from 'typeorm';

export class EncargadoConsultaOrdenes1710000000008 implements MigrationInterface {
  name = 'EncargadoConsultaOrdenes1710000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bloqueante de verificación: sin este permiso el Encargado de Producción
    // no puede listar ni ver el detalle de sus propias órdenes (toda
    // /api/produccion/* de lectura exige ordenes.consultar desde WP1).
    // El Supervisor sigue sin permisos de mutación.
    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Encargado de Producción'
        AND p.codigo = 'ordenes.consultar'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso rp USING roles r, permisos p
      WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
        AND r.nombre = 'Encargado de Producción'
        AND p.codigo = 'ordenes.consultar';
    `);
  }
}
