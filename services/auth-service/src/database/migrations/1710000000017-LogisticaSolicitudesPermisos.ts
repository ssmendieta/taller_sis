import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticaSolicitudesPermisos1710000000017 implements MigrationInterface {
  name = 'LogisticaSolicitudesPermisos1710000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permisos (codigo, nombre, descripcion)
      VALUES
        (
          'logistica.solicitudes.gestionar',
          'Gestionar solicitudes de salida de Logística',
          'Crear y modificar solicitudes documentales de salida.'
        ),
        (
          'logistica.solicitudes.consultar',
          'Consultar solicitudes de salida de Logística',
          'Consultar solicitudes documentales de salida.'
        )
      ON CONFLICT (codigo) DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.nombre = 'Encargado de Logística'
        AND p.codigo IN (
          'logistica.solicitudes.gestionar',
          'logistica.solicitudes.consultar'
        )
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.nombre = 'Supervisor'
        AND p.codigo = 'logistica.solicitudes.consultar'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso rp
      USING permisos p
      WHERE rp.permiso_id = p.id
        AND p.codigo IN (
          'logistica.solicitudes.gestionar',
          'logistica.solicitudes.consultar'
        );
    `);

    await queryRunner.query(`
      DELETE FROM permisos
      WHERE codigo IN (
        'logistica.solicitudes.gestionar',
        'logistica.solicitudes.consultar'
      );
    `);
  }
}
