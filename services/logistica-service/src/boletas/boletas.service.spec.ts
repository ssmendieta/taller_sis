import { BadGatewayException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BoletasService } from './boletas.service';

describe('ABC-213/214: creación de boletas con validación documental', () => {
  const save = jest.fn((_, value) => Promise.resolve(Array.isArray(value)
    ? value
    : { id: '10', numero: 'BOL-2026-00001', ...value }));
  const manager = { save, create: jest.fn((_type, value) => value) };
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
