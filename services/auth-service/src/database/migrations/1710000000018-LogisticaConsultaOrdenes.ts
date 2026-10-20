import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticaConsultaOrdenes1710000000018 implements MigrationInterface {
  name = 'LogisticaConsultaOrdenes1710000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Encargado de Logística'
        AND p.codigo = 'ordenes.consultar'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso rp USING roles r, permisos p
      WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
        AND r.nombre = 'Encargado de Logística'
        AND p.codigo = 'ordenes.consultar';
    `);
  }
}
