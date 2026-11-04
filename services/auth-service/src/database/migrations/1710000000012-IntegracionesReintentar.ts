import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegracionesReintentar1710000000012 implements MigrationInterface {
  name = 'IntegracionesReintentar1710000000012';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permisos (codigo, nombre, descripcion)
      VALUES ('integraciones.reintentar', 'Administrar publicaciones de integraciones',
        'Consultar eventos outbox y programar reintentos de publicación')
      ON CONFLICT (codigo) DO NOTHING;
    `);
    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Administrador' AND p.codigo = 'integraciones.reintentar'
      ON CONFLICT DO NOTHING;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir el catálogo implica retirar también las asignaciones personalizadas de este permiso.
    await queryRunner.query(`DELETE FROM rol_permiso WHERE permiso_id IN
      (SELECT id FROM permisos WHERE codigo = 'integraciones.reintentar')`);
    await queryRunner.query("DELETE FROM permisos WHERE codigo = 'integraciones.reintentar'");
  }
}
