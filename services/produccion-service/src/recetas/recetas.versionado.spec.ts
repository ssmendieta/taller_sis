import { ConflictException } from '@nestjs/common';
import { RecetasService } from './recetas.service';

function preparar(ordenesAsociadas: number) {
  const receta = { id: 5, productoCodigo: 'PAN-001', productoNombre: 'Pan' };
  const recetaRepository: any = { findOne: async () => receta };
  const recetaMaterialRepository: any = {};
  const materialRepository: any = {
    find: async () => [{ id: 1 }],
  };
  const ordenRepository: any = { count: async () => ordenesAsociadas };
  const servicio = new RecetasService(
    recetaRepository,
    recetaMaterialRepository,
    materialRepository,
    ordenRepository,
    {} as any,
  );
  return servicio;
}

describe('ABC-135: versionado real de recetas', () => {
  it('bloquea con 409 el cambio de materiales si hay órdenes asociadas', async () => {
    const servicio = preparar(2);
    await expect(
      servicio.update(5, { materiales: [{ material_id: 1, cantidad_requerida: 3 }] } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
