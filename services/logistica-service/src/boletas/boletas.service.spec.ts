import { BadGatewayException, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EstadoBoleta } from './entities/estado-boleta.enum';
import { BoletaEnvio } from './entities/boleta-envio.entity';
import { BoletaEnvioHistorial } from './entities/boleta-envio-historial.entity';
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

describe('ABC-258: listado paginado y filtros de boletas', () => {
  const getManyAndCount = jest.fn();
  const qb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount,
  };
  const repository = {
    createQueryBuilder: jest.fn(() => qb),
    find: jest.fn(),
    findOne: jest.fn(),
  } as any;
  const solicitudes = { findOne: jest.fn() } as any;
  const produccion = {
    consultarOrdenPorCodigo: jest.fn(),
    consultarOrdenPorId: jest.fn(),
    consultarPorOrden: jest.fn(),
  } as any;
  const dataSource = { transaction: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    getManyAndCount.mockResolvedValue([
      [
        {
          id: '1',
          numero: 'BOL-2026-00001',
          estado: 'BORRADOR',
          creadoEn: new Date('2026-10-17T15:30:00Z'),
          items: [],
          solicitudSalida: { id: '7', ordenId: '8' },
        },
      ],
      1,
    ]);
  });

  function service() { return new BoletasService(repository, solicitudes, dataSource, produccion); }

  it('lista boletas con paginación por defecto (page=1, limit=10) y orden estable', async () => {
    const result = await service().findAll({});
    expect(repository.createQueryBuilder).toHaveBeenCalledWith('boleta');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('boleta.items', 'item');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('boleta.solicitudSalida', 'solicitud');
    expect(qb.orderBy).toHaveBeenCalledWith('boleta.creado_en', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('boleta.id', 'DESC');
    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      items: expect.any(Array),
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('aplica paginación personalizada (skip y take según page y limit)', async () => {
    getManyAndCount.mockResolvedValueOnce([[], 35]);
    const result = await service().findAll({ page: 3, limit: 10 });
    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(35);
    expect(result.totalPages).toBe(4);
  });

  it('filtra por estado de boleta', async () => {
    await service().findAll({ estado: EstadoBoleta.EMITIDA });
    expect(qb.andWhere).toHaveBeenCalledWith('boleta.estado = :estado', { estado: 'EMITIDA' });
  });

  it('filtra por ordenId numérico directo', async () => {
    await service().findAll({ ordenId: '8' });
    expect(qb.andWhere).toHaveBeenCalledWith('solicitud.orden_id = :ordenId', { ordenId: '8' });
    expect(produccion.consultarOrdenPorCodigo).not.toHaveBeenCalled();
  });

  it('filtra por código de orden consultando a Producción', async () => {
    produccion.consultarOrdenPorCodigo.mockResolvedValueOnce({ id: '8', codigo: 'ORD-7' });
    await service().findAll({ orden: 'ORD-7' }, 'Bearer token-test');
    expect(produccion.consultarOrdenPorCodigo).toHaveBeenCalledWith('ORD-7', 'Bearer token-test');
    expect(qb.andWhere).toHaveBeenCalledWith('solicitud.orden_id = :ordenId', { ordenId: '8' });
  });

  it('retorna resultado vacío si el código de orden no existe en Producción (404)', async () => {
    produccion.consultarOrdenPorCodigo.mockRejectedValueOnce(new NotFoundException('Orden no encontrada'));
    const result = await service().findAll({ orden: 'ORD-INEXISTENTE' }, 'Bearer token-test');
    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('filtra por rango de fechas (fechaDesde y fechaHasta)', async () => {
    await service().findAll({
      fechaDesde: '2026-10-01T00:00:00.000Z',
      fechaHasta: '2026-10-15T23:59:59.999Z',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('boleta.creado_en >= :fechaDesde', {
      fechaDesde: '2026-10-01T00:00:00.000Z',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('boleta.creado_en <= :fechaHasta', {
      fechaHasta: '2026-10-15T23:59:59.999Z',
    });
  });

  it('combina filtros de orden, estado y rango de fechas simultáneamente', async () => {
    await service().findAll({
      ordenId: '15',
      estado: EstadoBoleta.ANULADA,
      fechaDesde: '2026-10-01T00:00:00.000Z',
      fechaHasta: '2026-10-10T23:59:59.999Z',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('solicitud.orden_id = :ordenId', { ordenId: '15' });
    expect(qb.andWhere).toHaveBeenCalledWith('boleta.estado = :estado', { estado: 'ANULADA' });
    expect(qb.andWhere).toHaveBeenCalledWith('boleta.creado_en >= :fechaDesde', {
      fechaDesde: '2026-10-01T00:00:00.000Z',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('boleta.creado_en <= :fechaHasta', {
      fechaHasta: '2026-10-10T23:59:59.999Z',
    });
  });

  it('es una operación de solo lectura (no llama a transacciones ni modificaciones)', async () => {
    await service().findAll({});
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

describe('ABC-225: validación de saldo documental y preservación de estado (pruebas unitarias con mocks)', () => {
  let boletaMock: any;
  let boletas: any;
  let solicitudes: any;
  let manager: any;
  let dataSource: any;
  let produccion: any;

  beforeEach(() => {
    jest.clearAllMocks();
    boletaMock = {
      id: '20',
      solicitudSalidaId: '15',
      estado: EstadoBoleta.BORRADOR,
      solicitudSalida: { id: '15', ordenId: '9' },
      items: [{ id: '1', referencia: 'LOT-99', cantidad: '8.0000' }],
    };
    boletas = { findOne: jest.fn().mockResolvedValue(boletaMock) };
    solicitudes = { findOne: jest.fn() };
    manager = {
      findOne: jest.fn().mockResolvedValue(boletaMock),
      query: jest.fn(),
      save: jest.fn().mockImplementation(async (_entity: unknown, value: unknown) => value),
    };
    dataSource = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    };
    produccion = {
      consultarOrdenPorId: jest.fn().mockResolvedValue({
        id: '9', codigo: 'ORD-9', producto_id: 5, producto: { codigo: 'P-5' },
      }),
      consultarConformesPorOrden: jest.fn().mockResolvedValue([{ cantidad: '10.0000' }]),
    };
  });

  function crearServicio() {
    return new BoletasService(boletas, solicitudes, dataSource, produccion);
  }

  it('rechaza con 409 Conflict si la cantidad solicitada excede el saldo conforme (sin emisiones previas) y preserva BORRADOR e ítems originales', async () => {
    const itemsOriginales = [
      { id: '1', referencia: 'LOT-99', cantidad: '12.0000' },
      { id: '2', referencia: 'LOT-88', cantidad: '3.0000' },
    ];
    boletaMock.items = JSON.parse(JSON.stringify(itemsOriginales));
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orden_id: '9' }])
      .mockResolvedValueOnce([{ total: '0' }]);

    const service = crearServicio();
    await expect(service.emitir('20', 'user-1', 'Bearer token'))
      .rejects.toThrow(new ConflictException('La cantidad solicitada supera el saldo documental disponible'));

    expect(manager.save).not.toHaveBeenCalled();
    expect(boletaMock.estado).toBe(EstadoBoleta.BORRADOR);
    expect(boletaMock.items).toEqual(itemsOriginales);
    expect(boletaMock.items).toHaveLength(2);
    expect(boletaMock.items[0]).toEqual(expect.objectContaining({ referencia: 'LOT-99', cantidad: '12.0000' }));
    expect(boletaMock.items[1]).toEqual(expect.objectContaining({ referencia: 'LOT-88', cantidad: '3.0000' }));
  });

  it('rechaza con 409 Conflict si lo emitido previamente más lo solicitado supera el conforme y no persiste cambios', async () => {
    const itemsOriginales = [{ id: '1', referencia: 'LOT-99', cantidad: '8.0000' }];
    boletaMock.items = JSON.parse(JSON.stringify(itemsOriginales));
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orden_id: '9' }])
      .mockResolvedValueOnce([{ total: '6.0000' }]);

    const service = crearServicio();
    await expect(service.emitir('20', 'user-1', 'Bearer token'))
      .rejects.toThrow(new ConflictException('La cantidad solicitada supera el saldo documental disponible'));

    expect(manager.save).not.toHaveBeenCalled();
    expect(boletaMock.estado).toBe(EstadoBoleta.BORRADOR);
    expect(boletaMock.items).toEqual(itemsOriginales);
    expect(boletaMock.items[0].cantidad).toBe('8.0000');
    expect(boletaMock.items[0].referencia).toBe('LOT-99');
  });

  it('rechaza con 409 Conflict si la boleta no se encuentra en estado BORRADOR (ej. ANULADA) y no toca Producción', async () => {
    boletaMock.estado = EstadoBoleta.ANULADA;
    const itemsOriginales = [{ id: '1', referencia: 'LOT-99', cantidad: '8.0000' }];
    boletaMock.items = JSON.parse(JSON.stringify(itemsOriginales));
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orden_id: '9' }]);

    const service = crearServicio();
    await expect(service.emitir('20', 'user-1', 'Bearer token'))
      .rejects.toThrow(new ConflictException('Solo una boleta BORRADOR puede emitirse'));

    expect(produccion.consultarConformesPorOrden).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(boletaMock.estado).toBe(EstadoBoleta.ANULADA);
    expect(boletaMock.items).toEqual(itemsOriginales);
  });

  it('emite satisfactoriamente y actualiza estado a EMITIDA cuando cabe exactamente en el saldo disponible', async () => {
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orden_id: '9' }])
      .mockResolvedValueOnce([{ total: '2.0000' }]);

    const service = crearServicio();
    const resultado = await service.emitir('20', 'user-1', 'Bearer token');

    expect(resultado.estado).toBe(EstadoBoleta.EMITIDA);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: '20', estado: EstadoBoleta.EMITIDA }),
    );
  });
});

describe('ABC-226: bloqueo concurrente y orden de operaciones (pruebas unitarias con mocks)', () => {
  let boletaMock: any;
  let boletas: any;
  let solicitudes: any;
  let manager: any;
  let dataSource: any;
  let produccion: any;

  beforeEach(() => {
    jest.clearAllMocks();
    boletaMock = {
      id: '30',
      solicitudSalidaId: '18',
      estado: EstadoBoleta.BORRADOR,
      solicitudSalida: { id: '18', ordenId: '12' },
      items: [{ id: '1', referencia: 'LOT-A', cantidad: '4.0000' }],
    };
    boletas = { findOne: jest.fn().mockResolvedValue(boletaMock) };
    solicitudes = { findOne: jest.fn() };
    manager = {
      findOne: jest.fn().mockResolvedValue(boletaMock),
      query: jest.fn(),
      save: jest.fn().mockImplementation(async (_entity: unknown, value: unknown) => value),
    };
    dataSource = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    };
    produccion = {
      consultarOrdenPorId: jest.fn().mockResolvedValue({
        id: '12', codigo: 'ORD-12', producto_id: 7, producto: { codigo: 'P-7' },
      }),
      consultarConformesPorOrden: jest.fn().mockResolvedValue([{ cantidad: '10.0000' }]),
    };
  });

  function crearServicio() {
    return new BoletasService(boletas, solicitudes, dataSource, produccion);
  }

  it('ejecuta en orden estricto: inserción de bloqueo, SELECT FOR UPDATE, y re-validación de saldo POST-bloqueo', async () => {
    const sequenceOfOperations: string[] = [];

    manager.query.mockImplementation(async (sql: string, _params: any[]) => {
      if (sql.includes('INSERT INTO boleta_emision_bloqueos')) {
        sequenceOfOperations.push('INSERT_LOCK');
        return [];
      }
      if (sql.includes('SELECT orden_id') && sql.includes('boleta_emision_bloqueos') && sql.includes('FOR UPDATE')) {
        sequenceOfOperations.push('SELECT_LOCK_FOR_UPDATE');
        return [{ orden_id: '12' }];
      }
      if (sql.includes('COALESCE(SUM(item.cantidad)')) {
        sequenceOfOperations.push('QUERY_EMITIDAS_POST_LOCK');
        return [{ total: '0' }];
      }
      return [];
    });

    manager.findOne.mockImplementation(async () => {
      sequenceOfOperations.push('FIND_BOLETA_POST_LOCK');
      return boletaMock;
    });

    produccion.consultarConformesPorOrden.mockImplementation(async () => {
      sequenceOfOperations.push('QUERY_CONFORMES_POST_LOCK');
      return [{ cantidad: '10.0000' }];
    });

    manager.save.mockImplementation(async (_entity: any, val: any) => {
      sequenceOfOperations.push('SAVE_EMITIDA');
      return val;
    });

    const service = crearServicio();
    await service.emitir('30', 'user-1', 'Bearer token');

    expect(sequenceOfOperations).toEqual([
      'INSERT_LOCK',
      'SELECT_LOCK_FOR_UPDATE',
      'FIND_BOLETA_POST_LOCK',
      'QUERY_CONFORMES_POST_LOCK',
      'QUERY_EMITIDAS_POST_LOCK',
      'SAVE_EMITIDA',
    ]);
  });

  it('verifica que las consultas de bloqueo usan los parámetros correctos (orden_id y producto_id)', async () => {
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orden_id: '12' }])
      .mockResolvedValueOnce([{ total: '0' }]);

    const service = crearServicio();
    await service.emitir('30', 'user-1', 'Bearer token');

    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/INSERT\s+INTO\s+boleta_emision_bloqueos\s*\(orden_id,\s*producto_id\)/),
      ['12', '7'],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/SELECT\s+orden_id[\s\S]*FROM\s+boleta_emision_bloqueos[\s\S]*FOR\s+UPDATE/),
      ['12', '7'],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('WHERE solicitud.orden_id = $1 AND boleta.estado = $2'),
      ['12', EstadoBoleta.EMITIDA],
    );
  });

  it('comportamiento idempotente: si tras adquirir el lock la boleta ya fue EMITIDA por otra transacción, no duplica guardado ni compromiso', async () => {
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ orden_id: '12' }]);

    const boletaYaEmitida = { ...boletaMock, estado: EstadoBoleta.EMITIDA };
    manager.findOne.mockResolvedValueOnce(boletaYaEmitida);

    const service = crearServicio();
    const resultado = await service.emitir('30', 'user-1', 'Bearer token');

    expect(resultado.estado).toBe(EstadoBoleta.EMITIDA);
    expect(produccion.consultarConformesPorOrden).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('ABC-232 / ABC-235: transición a EMITIDA, responsable emisor y precondiciones (pruebas unitarias con mocks)', () => {
  let boletaMock: any;
  let boletas: any;
  let solicitudes: any;
  let manager: any;
  let dataSource: any;
  let produccion: any;

  beforeEach(() => {
    jest.clearAllMocks();
    boletaMock = {
      id: '25',
      solicitudSalidaId: '16',
      estado: EstadoBoleta.BORRADOR,
      responsableUsuarioId: '10',
      solicitudSalida: { id: '16', ordenId: '9' },
      items: [{ id: '1', referencia: 'LOT-99', cantidad: '5.0000' }],
    };
    boletas = { findOne: jest.fn().mockResolvedValue(boletaMock) };
    solicitudes = { findOne: jest.fn() };
    manager = {
      findOne: jest.fn().mockResolvedValue(boletaMock),
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO boleta_emision_bloqueos')) return [];
        if (sql.includes('SELECT orden_id') && sql.includes('FOR UPDATE')) return [{ orden_id: '9' }];
        if (sql.includes('COALESCE(SUM(item.cantidad)')) return [{ total: '0' }];
        return [];
      }),
      save: jest.fn().mockImplementation(async (_entity: unknown, value: unknown) => value),
    };
    dataSource = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    };
    produccion = {
      consultarOrdenPorId: jest.fn().mockResolvedValue({
        id: '9', codigo: 'ORD-9', producto_id: 5, producto: { codigo: 'P-5' },
      }),
      consultarConformesPorOrden: jest.fn().mockResolvedValue([{ cantidad: '10.0000' }]),
    };
  });

  function crearServicio() {
    return new BoletasService(boletas, solicitudes, dataSource, produccion);
  }

  it('rechaza con 409 Conflict si la boleta en borrador tiene items: [] y no llega a guardarse como emitida', async () => {
    boletaMock.items = [];

    const service = crearServicio();
    await expect(service.emitir('25', '99', 'Bearer token'))
      .rejects.toThrow(new ConflictException('No se puede emitir una boleta sin ítems'));

    expect(produccion.consultarConformesPorOrden).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(boletaMock.estado).toBe(EstadoBoleta.BORRADOR);
    expect(boletaMock.responsableUsuarioId).toBe('10');
  });

  it('rechaza con 409 Conflict si la boleta en borrador tiene items undefined o null y conserva su estado', async () => {
    boletaMock.items = undefined;

    const service = crearServicio();
    await expect(service.emitir('25', '99', 'Bearer token'))
      .rejects.toThrow(new ConflictException('No se puede emitir una boleta sin ítems'));

    expect(produccion.consultarConformesPorOrden).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(boletaMock.estado).toBe(EstadoBoleta.BORRADOR);
    expect(boletaMock.responsableUsuarioId).toBe('10');
  });

  it('al emitir una boleta válida con usuarioId = 99, el objeto entregado a manager.save contiene responsableUsuarioId = 99', async () => {
    const service = crearServicio();
    const resultado = await service.emitir('25', '99', 'Bearer token');

    expect(resultado.estado).toBe(EstadoBoleta.EMITIDA);
    expect(resultado.responsableUsuarioId).toBe('99');
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: '25',
        estado: EstadoBoleta.EMITIDA,
        responsableUsuarioId: '99',
      }),
    );
  });

  it('conserva el responsable original y no vuelve a guardar si la boleta ya estaba EMITIDA (idempotente)', async () => {
    boletaMock.estado = EstadoBoleta.EMITIDA;
    boletaMock.responsableUsuarioId = '42';

    const service = crearServicio();
    const resultado = await service.emitir('25', '99', 'Bearer token');

    expect(resultado.estado).toBe(EstadoBoleta.EMITIDA);
    expect(resultado.responsableUsuarioId).toBe('42');
    expect(manager.save).not.toHaveBeenCalled();
  });
});

describe('ABC-246: anulación de boletas de envío en el servicio', () => {
  let boletaMock: any;
  let boletas: any;
  let solicitudes: any;
  let manager: any;
  let dataSource: any;
  let produccion: any;

  beforeEach(() => {
    jest.clearAllMocks();
    boletaMock = {
      id: '30',
      numero: 'BOL-2026-00030',
      solicitudSalidaId: '18',
      estado: EstadoBoleta.EMITIDA,
      responsableUsuarioId: '10',
      items: [
        { id: '1', boletaId: '30', referencia: 'LOT-A', cantidad: '4.0000' },
        { id: '2', boletaId: '30', referencia: 'LOT-B', cantidad: '6.0000' },
      ],
      historial: [],
    };
    boletas = {
      findOne: jest.fn().mockResolvedValue(boletaMock),
    };
    solicitudes = { findOne: jest.fn() };
    manager = {
      findOne: jest.fn().mockResolvedValue(boletaMock),
      query: jest.fn().mockResolvedValue([{ id: '30' }]),
      create: jest.fn((_type: any, val: any) => val),
      save: jest.fn().mockImplementation(async (_entity: unknown, value: unknown) => value),
    };
    dataSource = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    };
    produccion = {
      consultarOrdenPorId: jest.fn(),
      consultarPorOrden: jest.fn(),
      consultarConformesPorOrden: jest.fn(),
    };
  });

  function crearServicio() {
    return new BoletasService(boletas, solicitudes, dataSource, produccion);
  }

  it('anula exitosamente una boleta EMITIDA, actualiza estado a ANULADA y persiste historial en la misma transacción', async () => {
    const service = crearServicio();
    const dto = { motivo: 'Cliente solicitó cambio de lote' };

    const resultado = await service.anular('30', dto, '42');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id FROM boletas_envio WHERE id = $1 FOR UPDATE'),
      ['30'],
    );
    expect(resultado.id).toBe('30');
    expect(resultado.numero).toBe('BOL-2026-00030');
    expect(resultado.estado).toBe(EstadoBoleta.ANULADA);
    expect(resultado.responsableUsuarioId).toBe('10');
    expect(resultado.items).toHaveLength(2);

    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(manager.save).toHaveBeenCalledWith(
      BoletaEnvioHistorial,
      expect.objectContaining({
        boletaId: '30',
        estadoAnterior: EstadoBoleta.EMITIDA,
        estadoNuevo: EstadoBoleta.ANULADA,
        usuarioActorId: '42',
        motivo: 'Cliente solicitó cambio de lote',
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      BoletaEnvio,
      expect.objectContaining({
        id: '30',
        estado: EstadoBoleta.ANULADA,
      }),
    );
  });

  it('conserva el número, ítems y responsable original del documento tras anular', async () => {
    const service = crearServicio();
    const itemsOriginales = JSON.parse(JSON.stringify(boletaMock.items));

    const resultado = await service.anular('30', { motivo: 'Anulación por error de tipeo' }, '42');

    expect(resultado.numero).toBe('BOL-2026-00030');
    expect(resultado.items).toEqual(itemsOriginales);
    expect(resultado.responsableUsuarioId).toBe('10');
  });

  it('rechaza con 409 Conflict si la boleta está en estado BORRADOR y no guarda cambios ni historial', async () => {
    boletaMock.estado = EstadoBoleta.BORRADOR;
    const service = crearServicio();

    await expect(service.anular('30', { motivo: 'No deseado' }, '42'))
      .rejects.toThrow(new ConflictException('Solo se pueden anular boletas en estado EMITIDA (estado actual: BORRADOR)'));

    expect(manager.save).not.toHaveBeenCalled();
    expect(boletaMock.estado).toBe(EstadoBoleta.BORRADOR);
  });

  it('rechaza con 409 Conflict si la boleta ya se encuentra en estado ANULADA', async () => {
    boletaMock.estado = EstadoBoleta.ANULADA;
    const service = crearServicio();

    await expect(service.anular('30', { motivo: 'Intento de doble anulación' }, '42'))
      .rejects.toThrow(new ConflictException('La boleta ya se encuentra en estado ANULADA'));

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza con 404 NotFound si la boleta no existe', async () => {
    manager.findOne.mockResolvedValueOnce(null);
    const service = crearServicio();

    await expect(service.anular('99', { motivo: 'Boleta inexistente' }, '42'))
      .rejects.toThrow(new NotFoundException('Boleta no encontrada'));

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza con 404 NotFound si el identificador no es un número válido', async () => {
    const service = crearServicio();

    await expect(service.anular('abc', { motivo: 'Id inválido' }, '42'))
      .rejects.toThrow(new NotFoundException('Boleta no encontrada'));

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 400 BadRequest si el motivo es vacío o solo contiene espacios', async () => {
    const service = crearServicio();

    await expect(service.anular('30', { motivo: '   ' }, '42'))
      .rejects.toThrow(BadRequestException);

    await expect(service.anular('30', { motivo: '' }, '42'))
      .rejects.toThrow(BadRequestException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 400 BadRequest si el identificador de usuario es inválido', async () => {
    const service = crearServicio();

    await expect(service.anular('30', { motivo: 'Motivo correcto' }, '0'))
      .rejects.toThrow(BadRequestException);

    await expect(service.anular('30', { motivo: 'Motivo correcto' }, ''))
      .rejects.toThrow(BadRequestException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('aborta la transacción (rollback) si falla el guardado del historial de auditoría', async () => {
    const errorBd = new Error('Violación de restricción en historial');
    manager.save.mockRejectedValueOnce(errorBd);

    const service = crearServicio();
    await expect(service.anular('30', { motivo: 'Error auditoría' }, '42'))
      .rejects.toThrow(errorBd);

    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(BoletaEnvioHistorial, expect.anything());
  });

  it('aborta la transacción (rollback) si falla el guardado de la boleta de envío', async () => {
    const errorBd = new Error('Error al actualizar estado de boleta');
    manager.save
      .mockResolvedValueOnce({ id: '1', boletaId: '30' })
      .mockRejectedValueOnce(errorBd);

    const service = crearServicio();
    await expect(service.anular('30', { motivo: 'Error boleta' }, '42'))
      .rejects.toThrow(errorBd);

    expect(manager.save).toHaveBeenCalledTimes(2);
  });
});
