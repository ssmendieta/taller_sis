import { AvancesProduccionController } from './avances_produccion.controller';
import { AvancesProduccionService } from './avances_produccion.service';

describe('AvancesProduccionController', () => {
  it('ofrece el registro y lectura de avances, sin borrarlos ni editarlos', async () => {
    const servicio = { create: jest.fn().mockResolvedValue({ id: '1' }) };
    const controller = new AvancesProduccionController(servicio as unknown as AvancesProduccionService);
    expect(Object.getOwnPropertyNames(AvancesProduccionController.prototype).sort())
      .toEqual(['constructor', 'create', 'findAll', 'findOne'].sort());
    await expect(controller.create({ orden_id: 1, cantidad_producida: 2 }, { usuarioId: 7 }))
      .resolves.toEqual({ id: '1' });
    expect(servicio.create).toHaveBeenCalledWith({
      orden_id: 1, cantidad_producida: 2, usuario_responsable_id: 7,
    });
  });
});
