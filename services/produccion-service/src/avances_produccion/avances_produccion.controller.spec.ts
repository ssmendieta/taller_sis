import { AvancesProduccionController } from './avances_produccion.controller';
import { AvancesProduccionService } from './avances_produccion.service';

describe('AvancesProduccionController', () => {
  it('ofrece el registro y lectura de avances, sin borrarlos ni editarlos', async () => {
    const servicio = { create: jest.fn().mockResolvedValue({ id: '1' }) };
    const controller = new AvancesProduccionController(servicio as unknown as AvancesProduccionService);
    expect(Object.getOwnPropertyNames(AvancesProduccionController.prototype).sort())
      .toEqual(['constructor', 'create', 'findAll', 'findOne'].sort());
    const usuarioAutenticado = { sub: 7, rolNombre: 'Encargado de Producción' };
    await expect(
      controller.create({ orden_id: 1, cantidad_producida: 2 }, { usuarioAutenticado }),
    ).resolves.toEqual({ id: '1' });
    expect(servicio.create).toHaveBeenCalledWith(
      { orden_id: 1, cantidad_producida: 2 },
      usuarioAutenticado,
    );
  });

  it('POST /avances-produccion pasa el DTO y la identidad autenticada al servicio', async () => {
    const create = jest.fn().mockResolvedValue({ id: '71' });
    const controller = new AvancesProduccionController({ create } as unknown as AvancesProduccionService);
    const dto = { orden_id: 42, cantidad_producida: 2.5 };
    const usuarioAutenticado = { sub: 9, rolNombre: 'Encargado de Producción' };

    await controller.create(dto, { usuarioAutenticado });

    expect(create).toHaveBeenCalledWith(dto, usuarioAutenticado);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
