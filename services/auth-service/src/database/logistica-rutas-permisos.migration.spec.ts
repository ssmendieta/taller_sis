import { QueryRunner } from 'typeorm';
import { LogisticaRutasPermisos1710000000019 } from './migrations/1710000000019-LogisticaRutasPermisos';

function queryRunnerDePrueba() {
  const query = jest.fn().mockResolvedValue(undefined);
  return {
    query,
    queryRunner: { query } as unknown as QueryRunner,
  };
}

describe('ABC-370: permisos de rutas de Logística', () => {
  // NOTA: QueryRunner simulado; verifica la estructura SQL, no el motor PostgreSQL en vivo.

  it('crea los permisos y solo da gestión al Encargado de Logística', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new LogisticaRutasPermisos1710000000019().up(queryRunner);

    const [, asignacionLogistica, asignacionSupervisor] = query.mock.calls.map(
      ([sentencia]) => sentencia,
    );
    const sql = query.mock.calls.map(([sentencia]) => sentencia).join('\n');
    expect(query).toHaveBeenCalledTimes(3);
    expect(sql).toContain('logistica.rutas.gestionar');
    expect(sql).toContain('logistica.rutas.consultar');
    expect(asignacionLogistica).toContain("r.nombre = 'Encargado de Logística'");
    expect(asignacionLogistica).toContain('logistica.rutas.gestionar');
    expect(asignacionSupervisor).toContain("r.nombre = 'Supervisor'");
    expect(asignacionSupervisor).toContain('logistica.rutas.consultar');
    expect(asignacionSupervisor).not.toContain('logistica.rutas.gestionar');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });

  it('retira primero las asignaciones y después los permisos', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new LogisticaRutasPermisos1710000000019().down(queryRunner);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM rol_permiso');
    expect(query.mock.calls[1][0]).toContain('DELETE FROM permisos');
  });
});
