import { BadGatewayException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
});

describe('ABC-224: regla de concurrencia documental', () => {
  const boletaBorrador = {
    id: '10',
    solicitudSalidaId: '7',
    estado: 'BORRADOR',
    solicitudSalida: { id: '7', ordenId: '8' },
    items: [{ referencia: 'L-1', cantidad: '6.0000' }],
  };
  const boletas = { findOne: jest.fn() } as any;
  const solicitudes = {} as any;
  const manager = {
    findOne: jest.fn(),
    query: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  } as any;
  const produccion = {
    consultarOrdenPorId: jest.fn(),
    consultarConformesPorOrden: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    boletaBorrador.estado = 'BORRADOR';
    boletas.findOne.mockResolvedValue(boletaBorrador);
    manager.findOne.mockResolvedValue(boletaBorrador);
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orden_id: '8' }])
      .mockResolvedValueOnce([{ total: '4.0000' }]);
    manager.save.mockImplementation(async (_entity: unknown, value: unknown) => value);
    produccion.consultarOrdenPorId.mockResolvedValue({
      id: '8', codigo: 'ORD-7', producto_id: 3, producto: { codigo: 'P-3' },
    });
    produccion.consultarConformesPorOrden.mockResolvedValue([{ cantidad: '10.0000' }]);
  });

  it('emite un borrador cuando la cantidad solicitada cabe en el saldo documental', async () => {
    const service = new BoletasService(boletas, solicitudes, dataSource, produccion);

    await expect(service.emitir('10', '42', 'Bearer token')).resolves.toMatchObject({
      id: '10',
      estado: 'EMITIDA',
    });
  });

  it('rechaza con conflicto cuando el saldo fue consumido por otra emisión', async () => {
    manager.query.mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orden_id: '8' }])
      .mockResolvedValueOnce([{ total: '5.0000' }]);
    const service = new BoletasService(boletas, solicitudes, dataSource, produccion);

    await expect(service.emitir('10', '42', 'Bearer token'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza un identificador de boleta inválido antes de consultar dependencias', async () => {
    const service = new BoletasService(boletas, solicitudes, dataSource, produccion);

    await expect(service.emitir('abc', '42', 'Bearer token'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(produccion.consultarOrdenPorId).not.toHaveBeenCalled();
  });

  it('no abre la transacción si Producción devuelve una orden o producto inválido', async () => {
    produccion.consultarOrdenPorId.mockResolvedValueOnce({
      id: '8', codigo: 'ORD-7', producto_id: 0, producto: null,
    });
    const service = new BoletasService(boletas, solicitudes, dataSource, produccion);

    await expect(service.emitir('10', '42', 'Bearer token'))
      .rejects.toBeInstanceOf(BadGatewayException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('no duplica el compromiso cuando la boleta ya está emitida', async () => {
    boletaBorrador.estado = 'EMITIDA';
    const service = new BoletasService(boletas, solicitudes, dataSource, produccion);

    await expect(service.emitir('10', '42', 'Bearer token'))
      .resolves.toMatchObject({ estado: 'EMITIDA' });
    expect(produccion.consultarConformesPorOrden).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('revierte la emisión si no puede consultar los conformes de Producción', async () => {
    produccion.consultarConformesPorOrden.mockRejectedValueOnce(
      new ServiceUnavailableException('Producción no está disponible'),
    );
    const service = new BoletasService(boletas, solicitudes, dataSource, produccion);

    await expect(service.emitir('10', '42', 'Bearer token'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
