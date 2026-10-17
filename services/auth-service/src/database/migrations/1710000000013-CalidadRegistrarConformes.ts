import { MigrationInterface, QueryRunner } from 'typeorm';

export class CalidadRegistrarConformes1710000000013
  implements MigrationInterface {
  name = 'CalidadRegistrarConformes1710000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permisos (codigo, nombre, descripcion, activo)
      VALUES (
        'calidad.registrar_conformes',
        'Registrar resultados de calidad',
        'Registrar productos conformes y defectuosos de una orden de producción.',
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
        AND p.codigo = 'calidad.registrar_conformes'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso
      WHERE permiso_id IN (
        SELECT id FROM permisos
        WHERE codigo = 'calidad.registrar_conformes'
      );
    `);

    await queryRunner.query(`
      DELETE FROM permisos
      WHERE codigo = 'calidad.registrar_conformes';
    `);
  }
}
