import { MigrationInterface, QueryRunner } from 'typeorm';

export class LogisticaConsultaProduccion1710000000018 implements MigrationInterface {
  name = 'LogisticaConsultaProduccion1710000000018';

  async up(queryRunner: QueryRunner): Promise<void> {
    const referencias = await queryRunner.query(`
      SELECT r.id AS rol_id, p.id AS permiso_id
      FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Encargado de Logística' AND p.codigo = 'ordenes.consultar'
    `);
    if (referencias.length !== 1) {
      throw new Error('Se requiere el rol Encargado de Logística y el permiso existente ordenes.consultar; ejecute primero las migraciones previas de Auth');
    }
    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [referencias[0].rol_id, referencias[0].permiso_id]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM rol_permiso rp USING roles r, permisos p
      WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
        AND r.nombre = 'Encargado de Logística' AND p.codigo = 'ordenes.consultar'
    `);
  }
}
