import { MigrationInterface, QueryRunner } from 'typeorm';

export class KpisMetasPermiso1710000000020 implements MigrationInterface {
  name = 'KpisMetasPermiso1710000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permisos (codigo, nombre, descripcion)
      VALUES (
        'kpis.metas.gestionar',
        'Gestionar metas de KPI',
        'Definir la meta y los umbrales del semáforo de cada KPI de Producción y Logística.'
      )
      ON CONFLICT (codigo) DO NOTHING;
    `);
    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permisos p
      WHERE r.nombre = 'Supervisor'
        AND p.codigo = 'kpis.metas.gestionar'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso rp
      USING permisos p
      WHERE rp.permiso_id = p.id AND p.codigo = 'kpis.metas.gestionar';
    `);
    await queryRunner.query(`DELETE FROM permisos WHERE codigo = 'kpis.metas.gestionar';`);
  }
}
