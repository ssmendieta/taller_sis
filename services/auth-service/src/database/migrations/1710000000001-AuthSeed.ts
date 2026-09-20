import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthSeed1710000000001 implements MigrationInterface {
  name = 'AuthSeed1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO roles (nombre, descripcion)
      VALUES
        ('Administrador','Administración de usuarios, roles, permisos y auditoría.'),
        ('Encargado de Producción','Operación del proceso de producción.'),
        ('Encargado de Logística','Rol preparado para operaciones de logística interna; sin funcionalidades de negocio en Sprint 1.'),
        ('Supervisor','Consulta y supervisión de información del sistema.')
      ON CONFLICT (nombre) DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO permisos (codigo, nombre, descripcion)
      VALUES
        ('usuarios.gestionar','Gestionar usuarios','Crear, editar, activar, desactivar y dar de baja usuarios.'),
        ('roles_permisos.gestionar','Gestionar roles y permisos','Consultar y modificar roles y permisos.'),
        ('auditoria.consultar','Consultar auditoría','Consultar registros de auditoría.'),
        ('ordenes.crear','Crear órdenes','Registrar órdenes de producción.'),
        ('ordenes.consultar','Consultar órdenes','Consultar listado y detalle de órdenes.'),
        ('ordenes.cambiar_estado','Cambiar estado de orden','Ejecutar transiciones válidas de estado.'),
        ('ordenes.iniciar','Iniciar producción','Iniciar una orden cuando se cumplen las precondiciones.'),
        ('ordenes.registrar_avance','Registrar avance','Registrar avances parciales de producción.'),
        ('ordenes.finalizar_cancelar','Finalizar o cancelar orden','Cerrar una orden o cancelarla con motivo.'),
        ('recetas.gestionar','Gestionar recetas','Registrar y administrar recetas de productos.'),
        ('materiales.calcular','Calcular materiales','Calcular materiales requeridos para una orden.'),
        ('materiales.consultar_disponibilidad','Consultar disponibilidad','Consultar disponibilidad simulada de materiales.'),
        ('materiales.solicitar','Generar solicitud de materia prima','Crear la solicitud simulada dirigida conceptualmente a Inventarios.')
      ON CONFLICT (codigo) DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.nombre = 'Administrador'
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo IN (
        'ordenes.crear','ordenes.consultar','ordenes.cambiar_estado','ordenes.iniciar','ordenes.registrar_avance','ordenes.finalizar_cancelar','recetas.gestionar','materiales.calcular','materiales.consultar_disponibilidad','materiales.solicitar'
      ) WHERE r.nombre = 'Encargado de Producción'
      ON CONFLICT DO NOTHING;
    `);

    await queryRunner.query(`
      INSERT INTO rol_permiso (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r JOIN permisos p ON p.codigo IN ('ordenes.consultar') WHERE r.nombre = 'Supervisor'
      ON CONFLICT DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM rol_permiso WHERE rol_id IN (SELECT id FROM roles WHERE nombre IN ('Administrador','Encargado de Producción','Supervisor','Encargado de Logística'));`);
    await queryRunner.query(`DELETE FROM permisos WHERE codigo IN ('usuarios.gestionar','roles_permisos.gestionar','auditoria.consultar','ordenes.crear','ordenes.consultar','ordenes.cambiar_estado','ordenes.iniciar','ordenes.registrar_avance','ordenes.finalizar_cancelar','recetas.gestionar','materiales.calcular','materiales.consultar_disponibilidad','materiales.solicitar');`);
    await queryRunner.query(`DELETE FROM roles WHERE nombre IN ('Administrador','Encargado de Producción','Encargado de Logística','Supervisor');`);
  }
}
