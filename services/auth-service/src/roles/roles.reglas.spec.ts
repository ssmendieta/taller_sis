import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RolesService } from './roles.service';

function crearServicio(rolesGuardados: any[] = [], usuariosActivos = 0) {
  const rolesRepo: any = {
    findOne: async ({ where }: any) =>
      rolesGuardados.find((r) => String(r.nombre) === String(where.nombre)) ??
      rolesGuardados.find((r) => String(r.id) === String(where.id)) ??
      null,
    find: async () => rolesGuardados,
  };
  const permisosRepo: any = {
    createQueryBuilder: () => ({
      where: () => ({
        getMany: async () => [
          { id: '1', codigo: 'auditoria.consultar', nombre: 'Auditoría' },
        ],
      }),
    }),
  };
  const usuariosRepo: any = {
    createQueryBuilder: () => ({
      where: function () { return this; },
      andWhere: function () { return this; },
      getCount: async () => usuariosActivos,
    }),
  };
  const manager: any = {
    getRepository: () => ({
      save: async (r: any) => ({ ...r, id: r.id ?? '9', permisos: r.permisos ?? [] }),
      create: (v: any) => ({ ...v }),
    }),
  };
  const dataSource: any = {
    transaction: async (fn: any) => fn(manager),
  };
  const auditoria: any = { registrar: async () => null };
  const servicio = new RolesService(
    rolesRepo,
    permisosRepo,
    usuariosRepo,
    dataSource,
    auditoria,
  );
  return servicio;
}

describe('ABC-87: reglas de roles', () => {
  it('rechaza nombre duplicado con 409', async () => {
    const servicio = crearServicio([{ id: '1', nombre: 'Auditor', permisos: [] }]);
    await expect(
      servicio.create({ nombre: 'Auditor' } as any, '1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('no permite desactivar un rol con usuarios activos', async () => {
    const servicio = crearServicio(
      [{ id: '5', nombre: 'Operativo', activo: true, permisos: [] }],
      2,
    );
    (servicio as any).findOne = async () => ({
      id: '5',
      nombre: 'Operativo',
      activo: true,
      permisos: [],
    });
    await expect(
      servicio.update(5, { activo: false } as any, '1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('no permite DELETE físico de roles', () => {
    const servicio = crearServicio();
    expect(() => servicio.remove()).toThrow(ForbiddenException);
  });
});
