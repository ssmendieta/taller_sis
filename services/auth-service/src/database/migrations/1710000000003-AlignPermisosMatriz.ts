import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignPermisosMatriz1710000000003 implements MigrationInterface {
  name = 'AlignPermisosMatriz1710000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La matriz reserva la administración para Administrador.
    await queryRunner.query(`
      DELETE FROM rol_permiso rp USING roles r, permisos p
      WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
        AND r.nombre = 'Administrador'
        AND p.codigo IN (
          'ordenes.crear', 'ordenes.consultar', 'ordenes.cambiar_estado',
          'ordenes.iniciar', 'ordenes.registrar_avance', 'ordenes.finalizar_cancelar',
          'recetas.gestionar', 'materiales.calcular',
          'materiales.consultar_disponibilidad', 'materiales.solicitar'
        );
    `);

  
    await queryRunner.query(`
      DELETE FROM rol_permiso rp USING roles r, permisos p
      WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
        AND r.nombre = 'Encargado de Producción'
        AND p.codigo IN ('ordenes.consultar', 'materiales.solicitar');
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Administrador'
        AND p.codigo IN ('usuarios.gestionar', 'roles_permisos.gestionar', 'auditoria.consultar')
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Encargado de Producción'
        AND p.codigo IN (
          'ordenes.crear', 'ordenes.cambiar_estado', 'ordenes.iniciar',
          'ordenes.registrar_avance', 'ordenes.finalizar_cancelar',
          'recetas.gestionar', 'materiales.calcular',
          'materiales.consultar_disponibilidad'
        )
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Supervisor' AND p.codigo = 'ordenes.consultar'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restituye las asignaciones originales de AuthSeed al revertir este ajuste.
    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Administrador'
      ON CONFLICT DO NOTHING;
    `);
    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
      WHERE r.nombre = 'Encargado de Producción'
        AND p.codigo IN ('ordenes.consultar', 'materiales.solicitar')
      ON CONFLICT DO NOTHING;
    `);
  }
}
