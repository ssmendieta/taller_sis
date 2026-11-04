import { QueryRunner } from 'typeorm';
import { CalidadRegistrarConformes1710000000013 } from './migrations/1710000000013-CalidadRegistrarConformes';

function queryRunnerDePrueba() {
  const query = jest.fn().mockResolvedValue(undefined);
  return {
    query,
    queryRunner: { query } as unknown as QueryRunner,
  };
}

describe('permiso para registrar resultados de calidad', () => {
  it('crea el permiso y lo asigna a los roles autorizados', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new CalidadRegistrarConformes1710000000013().up(queryRunner);

    expect(query).toHaveBeenCalledTimes(2);
    const crearPermiso = query.mock.calls[0][0] as string;
    const asignarPermiso = query.mock.calls[1][0] as string;
    expect(crearPermiso).toContain("'calidad.registrar_conformes'");
    expect(crearPermiso).toContain('ON CONFLICT (codigo) DO NOTHING');
    expect(asignarPermiso).toContain(
      "r.nombre IN ('Administrador', 'Encargado de Producción')",
    );
    expect(asignarPermiso).toContain("p.codigo = 'calidad.registrar_conformes'");
    expect(asignarPermiso).toContain('ON CONFLICT DO NOTHING');
  });

  it('elimina sus asignaciones antes de eliminar el permiso', async () => {
    const { query, queryRunner } = queryRunnerDePrueba();

    await new CalidadRegistrarConformes1710000000013().down(queryRunner);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM rol_permiso');
    expect(query.mock.calls[1][0]).toContain('DELETE FROM permisos');
    expect(query.mock.calls[1][0]).toContain("codigo = 'calidad.registrar_conformes'");
  });
});
