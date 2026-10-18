import { QueryRunner } from 'typeorm';
import { ReponerMaterialesSolicitar1710000000011 } from './migrations/1710000000011-ReponerMaterialesSolicitar';

function queryRunnerDePrueba() {
  const query = jest.fn().mockResolvedValue(undefined);
  return {
    query,
    queryRunner: { query } as unknown as QueryRunner,
  };
}

describe('ABC-270: permiso para solicitar materiales', () => {
  it('repone el permiso únicamente al Encargado de Producción', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new ReponerMaterialesSolicitar1710000000011().up(queryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO rol_permiso');
    expect(sql).toContain("r.nombre = 'Encargado de Producción'");
    expect(sql).toContain("p.codigo = 'materiales.solicitar'");
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).not.toContain('INSERT INTO permisos');
    expect(sql).not.toContain("r.nombre = 'Supervisor'");
    expect(sql).not.toContain("r.nombre = 'Administrador'");
    expect(sql).not.toContain("r.nombre = 'Encargado de Logística'");
  });

  it('revierte únicamente la asignación creada', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new ReponerMaterialesSolicitar1710000000011().down(queryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM rol_permiso');
    expect(sql).toContain("r.nombre = 'Encargado de Producción'");
    expect(sql).toContain("p.codigo = 'materiales.solicitar'");
    expect(sql).not.toContain('DELETE FROM permisos');
  });
});
