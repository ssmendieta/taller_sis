import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticaRutasPermisos1710000000019 implements MigrationInterface {
  name = 'LogisticaRutasPermisos1710000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permisos (codigo, nombre, descripcion)
      VALUES
        (
          'logistica.rutas.gestionar',
          'Gestionar rutas de transporte',
          'Crear y editar rutas con vehículo, chofer, paradas y boletas antes del despacho.'
        ),
        (
          'logistica.rutas.consultar',
          'Consultar rutas de transporte',
          'Consultar rutas planificadas, sus paradas y boletas.'
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
          'logistica.rutas.gestionar',
          'logistica.rutas.consultar'
        )
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.nombre = 'Supervisor'
        AND p.codigo = 'logistica.rutas.consultar'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso rp
      USING permisos p
      WHERE rp.permiso_id = p.id
        AND p.codigo IN (
          'logistica.rutas.gestionar',
          'logistica.rutas.consultar'
        );
    `);

    await queryRunner.query(`
      DELETE FROM permisos
      WHERE codigo IN (
        'logistica.rutas.gestionar',
        'logistica.rutas.consultar'
      );
    `);
  }
}
