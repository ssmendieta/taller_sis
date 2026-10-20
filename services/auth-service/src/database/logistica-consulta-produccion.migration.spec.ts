import { DataSource } from 'typeorm';
import { AppDataSource } from './data-source';
import { AuthSchema1710000000000 } from './migrations/1710000000000-AuthSchema';
import { LogisticaConsultaProduccion1710000000018 } from './migrations/1710000000018-LogisticaConsultaProduccion';

const describeReal = process.env.AUTH_DB_REAL === '1' ? describe : describe.skip;

describeReal('Logistica: autorizar la consulta existente de Produccion', () => {
  it('asigna solo lectura a Logistica, es idempotente y down conserva los permisos ajenos', async () => {
    const source = new DataSource({ ...AppDataSource.options, migrations: [] });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    try {
      const schema = `logistica_auth_test_${process.pid}_${Date.now()}`;
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new AuthSchema1710000000000().up(runner);
      await runner.query("INSERT INTO roles(nombre) VALUES ('Encargado de Logística'), ('Supervisor'), ('Administrador')");
      await runner.query(`INSERT INTO permisos(codigo,nombre) VALUES
        ('ordenes.consultar','Consulta'), ('ordenes.crear','Crear orden'), ('logistica.boletas.gestionar','Boletas')`);
      await runner.query(`INSERT INTO rol_permiso SELECT r.id,p.id FROM roles r CROSS JOIN permisos p
        WHERE (r.nombre='Supervisor' AND p.codigo='ordenes.consultar') OR
          (r.nombre='Encargado de Logística' AND p.codigo='logistica.boletas.gestionar')`);
      const antes = await runner.query('SELECT * FROM rol_permiso ORDER BY rol_id, permiso_id');
      const migration = new LogisticaConsultaProduccion1710000000018();
      await migration.up(runner);
      await migration.up(runner);
      expect(await runner.query(`SELECT p.codigo FROM roles r JOIN rol_permiso rp ON rp.rol_id=r.id
        JOIN permisos p ON p.id=rp.permiso_id WHERE r.nombre='Encargado de Logística' ORDER BY p.codigo`))
        .toEqual([{ codigo: 'logistica.boletas.gestionar' }, { codigo: 'ordenes.consultar' }]);
      expect(await runner.query('SELECT * FROM rol_permiso')).toHaveLength(antes.length + 1);
      await migration.down(runner);
      expect(await runner.query('SELECT * FROM rol_permiso ORDER BY rol_id, permiso_id')).toEqual(antes);
      expect(await runner.query("SELECT * FROM permisos WHERE codigo='ordenes.consultar'")).toHaveLength(1);
      await runner.query("DELETE FROM rol_permiso WHERE permiso_id IN (SELECT id FROM permisos WHERE codigo='ordenes.consultar')");
      await runner.query("DELETE FROM permisos WHERE codigo='ordenes.consultar'");
      await expect(migration.up(runner)).rejects.toThrow('Se requiere el rol Encargado de Logística');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await source.destroy();
    }
  }, 30000);
});
