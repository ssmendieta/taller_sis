import { QueryRunner } from 'typeorm';
import { LogisticaBoletasPermisos1710000000010 } from './migrations/1710000000010-LogisticaBoletasPermisos';

function queryRunnerDePrueba() {
  const query = jest.fn().mockResolvedValue(undefined);
  return {
    query,
    queryRunner: { query } as unknown as QueryRunner,
  };
}

describe('ABC-271: permisos documentales de Logística', () => {
  it('crea los permisos y los asigna a los roles autorizados', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new LogisticaBoletasPermisos1710000000010().up(queryRunner);

    const [, asignacionLogistica, asignacionSupervisor] = query.mock.calls.map(
      ([sentencia]) => sentencia,
    );
    const sql = query.mock.calls.map(([sentencia]) => sentencia).join('\n');
    expect(query).toHaveBeenCalledTimes(3);
    expect(sql).toContain('logistica.boletas.gestionar');
    expect(sql).toContain('logistica.boletas.consultar');
    expect(asignacionLogistica).toContain("r.nombre = 'Encargado de Logística'");
    expect(asignacionLogistica).toContain('logistica.boletas.gestionar');
    expect(asignacionLogistica).toContain('logistica.boletas.consultar');
    expect(asignacionSupervisor).toContain("r.nombre = 'Supervisor'");
    expect(asignacionSupervisor).toContain('logistica.boletas.consultar');
    expect(asignacionSupervisor).not.toContain('logistica.boletas.gestionar');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });

  it('retira primero las asignaciones y después los permisos', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new LogisticaBoletasPermisos1710000000010().down(queryRunner);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM rol_permiso');
    expect(query.mock.calls[1][0]).toContain('DELETE FROM permisos');
    for (const [sentencia] of query.mock.calls) {
      expect(sentencia).toContain('logistica.boletas.gestionar');
      expect(sentencia).toContain('logistica.boletas.consultar');
    }
  });
});
