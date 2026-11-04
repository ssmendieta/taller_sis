import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgregarPermisoRegistrarConsumo1710000000012
  implements MigrationInterface {
  name = 'AgregarPermisoRegistrarConsumo1710000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permisos (codigo, nombre, descripcion, activo)
      VALUES (
        'materiales.registrar_consumo',
        'Registrar consumo de materiales',
        'Registrar el consumo real de materiales de una orden.',
        TRUE
      )
      ON CONFLICT (codigo) DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.nombre IN ('Administrador', 'Encargado de Producción')
        AND p.codigo = 'materiales.registrar_consumo'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso
      WHERE permiso_id IN (
        SELECT id FROM permisos
        WHERE codigo = 'materiales.registrar_consumo'
      );
    `);

    await queryRunner.query(`
      DELETE FROM permisos
      WHERE codigo = 'materiales.registrar_consumo';
    `);
  }
}
