import { BadGatewayException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BoletasService } from './boletas.service';

describe('ABC-213/214: creación de boletas con validación documental', () => {
  const save = jest.fn((_, value) => Promise.resolve(Array.isArray(value)
    ? value
    : { id: '10', numero: 'BOL-2026-00001', ...value }));
  const del = jest.fn().mockResolvedValue(undefined);
  const manager = { save, delete: del, create: jest.fn((_type, value) => value) };
  const dataSource = { transaction: jest.fn((callback) => callback(manager)) } as any;
  const repository = { find: jest.fn(), findOne: jest.fn() } as any;
  const solicitudes = { findOne: jest.fn() } as any;
  const produccion = { consultarOrdenPorId: jest.fn(), consultarPorOrden: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    solicitudes.findOne.mockResolvedValue({ id: '7', ordenId: '8', items: [{ referencia: 'L-1' }] });
    produccion.consultarOrdenPorId.mockResolvedValue({ id: '8', codigo: 'ORD-7', producto_id: 3, producto: { codigo: 'P-3' } });
    produccion.consultarPorOrden.mockResolvedValue([{ id: '4', codigo: 'L-1', ordenId: '8', productoId: '3', cantidad: '10.0000' }]);
  });

  function service() { return new BoletasService(repository, solicitudes, dataSource, produccion); }

  it('crea una boleta BORRADOR solo después de comprobar orden, producto y referencia', async () => {
    const result = await service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-1', cantidad: '10.0000' }] }, '42', 'Bearer token');
    expect(produccion.consultarOrdenPorId).toHaveBeenCalledWith('8', 'Bearer token');
    expect(produccion.consultarPorOrden).toHaveBeenCalledWith('ORD-7', 'Bearer token');
    expect(save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ responsableUsuarioId: '42', estado: 'BORRADOR' }));
    expect(result.items).toHaveLength(1);
  });

  it('rechaza una referencia que Producción no devolvió para la orden', async () => {
    await expect(service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-INVENTADO', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza un lote cuyo producto no coincide con la orden', async () => {
    produccion.consultarPorOrden.mockResolvedValueOnce([{ id: '4', codigo: 'L-1', ordenId: '8', productoId: '99', cantidad: '10.0000' }]);
    await expect(service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-1', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(BadGatewayException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza orden inexistente o respuesta orden-producto incompleta', async () => {
    solicitudes.findOne.mockResolvedValueOnce(null);
    await expect(service().create({ solicitudSalidaId: '99', items: [{ referencia: 'L-1', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(NotFoundException);
    produccion.consultarOrdenPorId.mockResolvedValueOnce({ id: '8', codigo: 'ORD-7', producto_id: 0, producto: null });
    await expect(service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-1', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(BadGatewayException);
  });

  it('propaga una indisponibilidad de Producción y no guarda', async () => {
    produccion.consultarOrdenPorId.mockRejectedValueOnce(new ServiceUnavailableException('timeout'));
    await expect(service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-1', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza cuando Producción devuelve lotes que pertenecen a otra orden', async () => {
    produccion.consultarPorOrden.mockResolvedValueOnce([
      { id: '4', codigo: 'L-1', ordenId: '8', productoId: '3', cantidad: '10.0000' },
      { id: '5', codigo: 'L-2', ordenId: '99', productoId: '3', cantidad: '5.0000' },
    ]);
    await expect(service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-1', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(BadGatewayException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza ítems presentes en la solicitud pero que no existen en los lotes de la orden en Producción', async () => {
    solicitudes.findOne.mockResolvedValueOnce({
      id: '7', ordenId: '8',
      items: [{ referencia: 'L-1' }, { referencia: 'L-2' }],
    });
    produccion.consultarPorOrden.mockResolvedValueOnce([
      { id: '4', codigo: 'L-1', ordenId: '8', productoId: '3', cantidad: '10.0000' },
    ]);
    await expect(service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-2', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza cuando la orden no existe en Producción (404) y no abre transacción', async () => {
    produccion.consultarOrdenPorId.mockRejectedValueOnce(new NotFoundException('Orden no encontrada en Producción'));
    await expect(service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-1', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('aborta la transacción (rollback) y propaga el error si falla el guardado de los ítems', async () => {
    const errorPersistencia = new Error('Violación de restricción en base de datos');
    manager.save.mockImplementationOnce((_type: any, val: any) => Promise.resolve({ id: '10', numero: 'BOL-2026-00001', ...val }));
    manager.save.mockRejectedValueOnce(errorPersistencia);

    await expect(service().create({ solicitudSalidaId: '7', items: [{ referencia: 'L-1', cantidad: '1.0000' }] }, '42', 'Bearer token'))
      .rejects.toThrow(errorPersistencia);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('ABC-220: edición de ítems de boleta en borrador', () => {
  const save = jest.fn((_, value) => Promise.resolve(Array.isArray(value) ? value : value));
  const del = jest.fn().mockResolvedValue(undefined);
  const manager = { save, delete: del, create: jest.fn((_type, value) => value) };
  const dataSource = { transaction: jest.fn((callback) => callback(manager)) } as any;
  const repository = { find: jest.fn(), findOne: jest.fn() } as any;
  const solicitudes = { findOne: jest.fn() } as any;
  const produccion = { consultarOrdenPorId: jest.fn(), consultarPorOrden: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue({
      id: '10',
      numero: 'BOL-2026-00001',
      estado: 'BORRADOR',
      solicitudSalidaId: '7',
      items: [{ id: '1', referencia: 'L-1', cantidad: '10.0000' }],
    });
    solicitudes.findOne.mockResolvedValue({ id: '7', ordenId: '8', items: [{ referencia: 'L-1' }, { referencia: 'L-2' }] });
    produccion.consultarOrdenPorId.mockResolvedValue({ id: '8', codigo: 'ORD-7', producto_id: 3, producto: { codigo: 'P-3' } });
    produccion.consultarPorOrden.mockResolvedValue([
      { id: '4', codigo: 'L-1', ordenId: '8', productoId: '3', cantidad: '10.0000' },
      { id: '5', codigo: 'L-2', ordenId: '8', productoId: '3', cantidad: '5.0000' },
    ]);
  });

  function service() { return new BoletasService(repository, solicitudes, dataSource, produccion); }

  it('actualiza los ítems de una boleta BORRADOR dentro de una transacción atómica', async () => {
    const result = await service().updateItems(
      '10',
      { items: [{ referencia: 'L-1', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    );

    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: '10' }, relations: { items: true } });
    expect(del).toHaveBeenCalledWith(expect.anything(), { boletaId: '10' });
    expect(save).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ boletaId: '10', referencia: 'L-1', cantidad: '8.0000' }),
    ]);
    expect(result.id).toBe('10');
    expect(result.estado).toBe('BORRADOR');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].cantidad).toBe('8.0000');
  });

  it('rechaza con 409 Conflict si la boleta está EMITIDA', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: '10',
      numero: 'BOL-2026-00001',
      estado: 'EMITIDA',
      solicitudSalidaId: '7',
      items: [],
    });

    await expect(service().updateItems(
      '10',
      { items: [{ referencia: 'L-1', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toBeInstanceOf(ConflictException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 409 Conflict si la boleta está ANULADA', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: '10',
      numero: 'BOL-2026-00001',
      estado: 'ANULADA',
      solicitudSalidaId: '7',
      items: [],
    });

    await expect(service().updateItems(
      '10',
      { items: [{ referencia: 'L-1', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toBeInstanceOf(ConflictException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 404 NotFound si la boleta no existe', async () => {
    repository.findOne.mockResolvedValueOnce(null);

    await expect(service().updateItems(
      '99',
      { items: [{ referencia: 'L-1', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 404 NotFound si el identificador es inválido', async () => {
    await expect(service().updateItems(
      'no-valido',
      { items: [{ referencia: 'L-1', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findOne).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 404 NotFound si la solicitud de salida no existe', async () => {
    solicitudes.findOne.mockResolvedValueOnce(null);

    await expect(service().updateItems(
      '10',
      { items: [{ referencia: 'L-1', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 404 NotFound si un ítem no pertenece a la solicitud de salida', async () => {
    await expect(service().updateItems(
      '10',
      { items: [{ referencia: 'L-DESCONOCIDO', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 404 NotFound si un ítem no pertenece a los lotes de Producción', async () => {
    produccion.consultarPorOrden.mockResolvedValueOnce([
      { id: '4', codigo: 'L-1', ordenId: '8', productoId: '3', cantidad: '10.0000' },
    ]);

    await expect(service().updateItems(
      '10',
      { items: [{ referencia: 'L-2', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con BadGatewayException si Producción devuelve datos inconsistentes', async () => {
    produccion.consultarOrdenPorId.mockResolvedValueOnce({ id: '8', codigo: 'ORD-7', producto_id: 0, producto: null });

    await expect(service().updateItems(
      '10',
      { items: [{ referencia: 'L-1', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toBeInstanceOf(BadGatewayException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('aborta la transacción (rollback simulado) y propaga el error si falla el guardado de los nuevos ítems', async () => {
    const errorPersistencia = new Error('Violación de restricción en base de datos');
    manager.save.mockRejectedValueOnce(errorPersistencia);

    await expect(service().updateItems(
      '10',
      { items: [{ referencia: 'L-1', cantidad: '8.0000' }] },
      '42',
      'Bearer token',
    )).rejects.toThrow(errorPersistencia);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(expect.anything(), { boletaId: '10' });
  });
});
