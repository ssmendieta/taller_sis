import { DataSource } from 'typeorm';
import { AppDataSource } from './data-source';
import { AuthSchema1710000000000 } from './migrations/1710000000000-AuthSchema';
import { IntegracionesReintentar1710000000012 } from './migrations/1710000000012-IntegracionesReintentar';

const describeReal = process.env.AUTH_DB_REAL === '1' ? describe : describe.skip;
describeReal('ABC-267: permiso administrativo en PostgreSQL', () => {
  it('up es idempotente, asigna solo al administrador y down preserva otros permisos', async () => {
    const source = new DataSource({ ...AppDataSource.options, migrations: [] });
    await source.initialize();
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const schema = `abc267_auth_${process.pid}_${Date.now()}`;
      await runner.query(`CREATE SCHEMA "${schema}"`);
      await runner.query(`SET LOCAL search_path TO "${schema}"`);
      await new AuthSchema1710000000000().up(runner);
      await runner.query("INSERT INTO roles(nombre) VALUES ('Administrador'), ('Supervisor')");
      await runner.query("INSERT INTO permisos(codigo,nombre) VALUES ('auditoria.consultar','Auditoría')");
      await runner.query('INSERT INTO rol_permiso SELECT r.id,p.id FROM roles r CROSS JOIN permisos p');
      const migration = new IntegracionesReintentar1710000000012();
      await migration.up(runner);
      await migration.up(runner);
      const asignaciones = await runner.query(`SELECT r.nombre FROM roles r
        JOIN rol_permiso rp ON rp.rol_id=r.id JOIN permisos p ON p.id=rp.permiso_id
        WHERE p.codigo='integraciones.reintentar'`);
      expect(asignaciones).toEqual([{ nombre: 'Administrador' }]);
      await migration.down(runner);
      expect(await runner.query("SELECT codigo FROM permisos")).toEqual([{ codigo: 'auditoria.consultar' }]);
      expect(await runner.query('SELECT * FROM rol_permiso')).toHaveLength(2);
      await migration.up(runner);
      expect(await runner.query("SELECT * FROM permisos WHERE codigo='integraciones.reintentar'")).toHaveLength(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await source.destroy();
    }
  }, 30000);
});
