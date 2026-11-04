import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrdenesService } from './ordenes.service';

function preparar(receta: any = { id: 2, activa: true }) {
  let secuencia = 0;
  const guardados: any[] = [];
  const manager = {
    create: (_t: unknown, v: any) => v,
    save: async (_t: unknown, v: any) => {
      const fila = { id: guardados.length + 1, ...v };
      guardados.push(fila);
      return fila;
    },
    findOne: async () => null,
  };
  const ordenes: any = {
    query: async () => [{ n: String((secuencia += 1)) }],
    manager: { transaction: async (fn: any) => fn(manager) },
  };
  const recetas = { findOne: async () => {
    if (!receta) throw new NotFoundException('Receta con id 2 no encontrada');
    return receta;
  } };
  const servicio = new OrdenesService(ordenes, {} as any, {} as any, recetas as any);
  return { servicio, guardados };
}

const actor = { sub: 7, rolNombre: 'Encargado de Producción', nombre: 'Ana Pérez' };

describe('ABC-116/117: validaciones de creación de órdenes', () => {
  it('rechaza receta inexistente con 404', async () => {
    const { servicio } = preparar(null);
    await expect(
      servicio.create({ producto_id: 2, cantidad: 1, fecha_programada: '2099-01-01' } as any, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza receta inactiva con 409', async () => {
    const { servicio } = preparar({ id: 2, activa: false });
    await expect(
      servicio.create({ producto_id: 2, cantidad: 1, fecha_programada: '2099-01-01' } as any, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza fecha anterior a hoy y cantidad con más de 4 decimales', async () => {
    const { servicio } = preparar();
    await expect(
      servicio.create({ producto_id: 2, cantidad: 1, fecha_programada: '2000-01-01' } as any, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      servicio.create({ producto_id: 2, cantidad: 1.12345, fecha_programada: '2099-01-01' } as any, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignora el responsable del body y guarda el snapshot del autenticado', async () => {
    const { servicio, guardados } = preparar();
    const orden = await servicio.create(
      { producto_id: 2, cantidad: 2, fecha_programada: '2099-01-01', responsable_id: 999 } as any,
      actor,
    );
    expect(orden.responsable_id).toBe(7);
    expect(orden.responsable_nombre).toBe('Ana Pérez');
    expect(orden.codigo).toMatch(/^ORD-\d{4}-\d{5}$/);
    expect(guardados.find((g) => g.estadoNuevo === 'PENDIENTE')?.usuarioResponsableNombre).toBe('Ana Pérez');
  });
});
