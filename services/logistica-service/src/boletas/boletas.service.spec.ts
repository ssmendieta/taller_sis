import { NotFoundException } from '@nestjs/common';
import { BoletasService } from './boletas.service';

describe('ABC-213: creación y consulta de boletas', () => {
  const save = jest.fn((_, value) => Promise.resolve(Array.isArray(value)
    ? value
    : { id: '10', numero: 'BOL-2026-00001', ...value }));
  const manager = {
    findOne: jest.fn().mockResolvedValue({ id: '7' }),
    save,
    create: jest.fn((_type, value) => value),
  };
  const dataSource = { transaction: jest.fn((callback) => callback(manager)) } as any;
  const repository = { find: jest.fn(), findOne: jest.fn() } as any;

  beforeEach(() => jest.clearAllMocks());

  it('crea una boleta BORRADOR con responsable autenticado e ítems en una transacción', async () => {
    const service = new BoletasService(repository, dataSource);
    const result = await service.create({ solicitudSalidaId: '7', items: [{ referencia: 'CAJA-1', cantidad: '10.0000' }] }, '42');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ responsableUsuarioId: '42', estado: 'BORRADOR' }));
    expect(result.items).toHaveLength(1);
  });

  it('rechaza una solicitud de salida inexistente sin guardar', async () => {
    manager.findOne.mockResolvedValueOnce(null);
    const service = new BoletasService(repository, dataSource);
    await expect(service.create({ solicitudSalidaId: '99', items: [{ referencia: 'A', cantidad: '1.0000' }] }, '42'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(save).not.toHaveBeenCalled();
  });
});
