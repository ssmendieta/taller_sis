import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Auditoria } from './entities/auditoria.entity';
import { AuditoriaService } from './auditoria.service';

describe('ABC-186: registro y consulta de auditoría', () => {
  const registros: Auditoria[] = [];
  const raw = [{
    id: '1', accion: 'CREAR_USUARIO', usuario_actor_nombre: 'Ana',
    usuario_afectado_nombre: 'Pedro', fecha_hora: new Date('2026-09-27T18:00:00Z'),
  }];
  const qb: Record<string, jest.Mock> = {};
  for (const metodo of ['leftJoin', 'select', 'orderBy', 'addOrderBy']) {
    qb[metodo] = jest.fn().mockReturnValue(qb);
  }
  qb.getRawMany = jest.fn().mockResolvedValue(raw);
  const repo = {
    create: (datos: Partial<Auditoria>) => datos as Auditoria,
    save: async (entidad: Auditoria) => {
      entidad.id = String(registros.length + 1);
      entidad.fecha_hora = new Date();
      registros.push(entidad);
      return entidad;
    },
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    findOneBy: async ({ id }: { id: string }) => registros.find((registro) => registro.id === id) ?? null,
  };
  const servicio = new AuditoriaService(repo as unknown as Repository<Auditoria>);

  beforeEach(() => registros.splice(0));

  it('guarda quién actuó, a quién afectó y los datos del cambio', async () => {
    const evento = await servicio.registrar({
      accion: 'DESACTIVAR_USUARIO', entidad: 'usuarios', entidad_id: '3',
      usuario_actor_id: '1', usuario_afectado_id: '3',
      datos_antes: { activo: true }, datos_despues: { activo: false },
    });
    expect(evento.usuario_actor_id).toBe('1');
    expect(evento.usuario_afectado_id).toBe('3');
    expect(evento.datos_antes).toEqual({ activo: true });
    expect(evento.datos_despues).toEqual({ activo: false });
    expect((await servicio.findOne(evento.id)).accion).toBe('DESACTIVAR_USUARIO');
    await expect(servicio.findOne('999')).rejects.toThrow(NotFoundException);
  });

  it('consulta nombres, acción y fecha para la pantalla de auditoría', async () => {
    expect(await servicio.findAll()).toEqual(raw);
    const campos = qb.select.mock.calls.at(-1)?.[0];
    expect(campos).toContain('actor.nombre_completo AS usuario_actor_nombre');
    expect(campos).toContain('afectado.nombre_completo AS usuario_afectado_nombre');
    expect(campos).toContain('a.fecha_hora AS fecha_hora');
  });
});
