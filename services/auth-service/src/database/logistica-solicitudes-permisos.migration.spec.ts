import { QueryRunner } from 'typeorm';
import { LogisticaSolicitudesPermisos1710000000017 } from './migrations/1710000000017-LogisticaSolicitudesPermisos';

function queryRunnerDePrueba() {
  const query = jest.fn().mockResolvedValue(undefined);
  return {
    query,
    queryRunner: { query } as unknown as QueryRunner,
  };
}

describe('ABC-273: permisos de solicitudes de salida de Logística', () => {
  // NOTA: Esta suite unitaria utiliza un QueryRunner simulado (mock) para verificar
  // la estructura SQL, la emisión de cláusulas ON CONFLICT DO NOTHING y el orden
  // de reversión convencional. No demuestra el comportamiento real del motor PostgreSQL en vivo.

  it('crea los permisos y los asigna a los roles autorizados', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new LogisticaSolicitudesPermisos1710000000017().up(queryRunner);

    const [, asignacionLogistica, asignacionSupervisor] = query.mock.calls.map(
      ([sentencia]) => sentencia,
    );
    const sql = query.mock.calls.map(([sentencia]) => sentencia).join('\n');
    expect(query).toHaveBeenCalledTimes(3);
    expect(sql).toContain('logistica.solicitudes.gestionar');
    expect(sql).toContain('logistica.solicitudes.consultar');
    expect(asignacionLogistica).toContain("r.nombre = 'Encargado de Logística'");
    expect(asignacionLogistica).toContain('logistica.solicitudes.gestionar');
    expect(asignacionLogistica).toContain('logistica.solicitudes.consultar');
    expect(asignacionSupervisor).toContain("r.nombre = 'Supervisor'");
    expect(asignacionSupervisor).toContain('logistica.solicitudes.consultar');
    expect(asignacionSupervisor).not.toContain('logistica.solicitudes.gestionar');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });

  it('retira primero las asignaciones en rol_permiso y después los permisos', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new LogisticaSolicitudesPermisos1710000000017().down(queryRunner);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM rol_permiso');
    expect(query.mock.calls[1][0]).toContain('DELETE FROM permisos');
    for (const [sentencia] of query.mock.calls) {
      expect(sentencia).toContain('logistica.solicitudes.gestionar');
      expect(sentencia).toContain('logistica.solicitudes.consultar');
    }
  });
});
