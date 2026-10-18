import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticaBoletasPermisos1710000000010 implements MigrationInterface {
  name = 'LogisticaBoletasPermisos1710000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permisos (codigo, nombre, descripcion)
      VALUES
        (
          'logistica.boletas.gestionar',
          'Gestionar boletas de Logística',
          'Crear y modificar boletas documentales de salida.'
        ),
        (
          'logistica.boletas.consultar',
          'Consultar boletas de Logística',
          'Consultar boletas documentales de salida.'
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
          'logistica.boletas.gestionar',
          'logistica.boletas.consultar'
        )
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.nombre = 'Supervisor'
        AND p.codigo = 'logistica.boletas.consultar'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso rp
      USING permisos p
      WHERE rp.permiso_id = p.id
        AND p.codigo IN (
          'logistica.boletas.gestionar',
          'logistica.boletas.consultar'
        );
    `);

    await queryRunner.query(`
      DELETE FROM permisos
      WHERE codigo IN (
        'logistica.boletas.gestionar',
        'logistica.boletas.consultar'
      );
    `);
  }
}
