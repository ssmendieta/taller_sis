import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { EstadoOrden } from '../ordenes/estado-orden.enum';
import { UsuarioAutenticadoProduccion } from '../ordenes/ordenes.service';
import { AvancesProduccion } from './entities/avances_produccion.entity';
import { CreateAvancesProduccionDto } from './dto/create-avances_produccion.dto';
import { AvancesProduccionService } from './avances_produccion.service';

describe('AvancesProduccionService.create (ABC-195)', () => {
  let service: AvancesProduccionService;

  const findOne = jest.fn();
  const query = jest.fn();
  const save = jest.fn();
  const transaction = jest.fn();
  const ordenBase = {
    id: 42,
    codigo: 'OP-042',
    cantidad: 10,
    estado: EstadoOrden.EN_PRODUCCION,
  } as OrdenProduccion;
  const usuario: UsuarioAutenticadoProduccion = {
    sub: 9,
    rolNombre: 'Encargado de Producción',
  };

  const manager = { findOne, query, save };
  const ordenRepository = {
    manager: { transaction },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findOne.mockResolvedValue(ordenBase);
    query.mockResolvedValue([{ acumulado: '0' }]);
    save.mockImplementation(async (_entity: unknown, values: object) => ({
      id: '71',
      ...values,
      fecha_hora: new Date('2026-09-29T12:00:00.000Z'),
    }));
    transaction.mockImplementation(
      async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
    );
    service = new AvancesProduccionService(
      ordenRepository as unknown as Repository<OrdenProduccion>,
    );
  });

  function dto(cantidad: number, ordenId = 42): CreateAvancesProduccionDto {
    return { orden_id: ordenId, cantidad_producida: cantidad };
  }

  it('rechaza cantidad menor que cero antes de iniciar la transacción', async () => {
    await expect(service.create(dto(-1), usuario)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza cantidad igual a cero antes de iniciar la transacción', async () => {
    await expect(service.create(dto(0), usuario)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza el registro cuando no hay identidad ni responsable válido', async () => {
    await expect(service.create(dto(1) as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('acepta cualquier rol verificado: el permiso lo decide el guard', async () => {
    const resultado = await service.create(dto(1), { sub: 9, rolNombre: 'Supervisor' });
    expect(transaction).toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(
      AvancesProduccion,
      expect.objectContaining({ usuario_responsable_id: '9' }),
    );
    expect(resultado.cantidad_producida_acumulada).toBe(1);
  });

  it('rechaza una identidad autenticada con ID inválido', async () => {
    await expect(
      service.create(dto(1), { sub: '0', rolNombre: 'Encargado de Producción' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('responde 404 si la orden no existe y no calcula ni inserta avance', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.create(dto(1), usuario)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(query).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('rechaza una orden que no está EN_PRODUCCION', async () => {
    findOne.mockResolvedValue({ ...ordenBase, estado: EstadoOrden.PLANIFICADA });

    await expect(service.create(dto(1), usuario)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(query).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('registra el primer avance y devuelve acumulado y pendiente', async () => {
    const resultado = await service.create(dto(3), usuario);

    expect(resultado).toMatchObject({
      cantidad_solicitada: 10,
      cantidad_producida_acumulada: 3,
      cantidad_pendiente: 7,
    });
    expect(save).toHaveBeenCalledWith(
      AvancesProduccion,
      expect.objectContaining({
        orden_id: '42',
        cantidad_producida: 3,
        usuario_responsable_id: '9',
      }),
    );
    const valoresGuardados = save.mock.calls[0][1] as Record<string, unknown>;
    expect(valoresGuardados).not.toHaveProperty('fecha_hora');
    expect(resultado.avance.fecha_hora).toEqual(
      new Date('2026-09-29T12:00:00.000Z'),
    );
  });

  it('suma el acumulado existente y el nuevo avance dentro de la transacción', async () => {
    query.mockResolvedValue([{ acumulado: '4.2500' }]);

    const resultado = await service.create(dto(2.5), usuario);

    expect(resultado.cantidad_producida_acumulada).toBe(6.75);
    expect(resultado.cantidad_pendiente).toBe(3.25);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SUM(cantidad_producida)'), [
      42,
    ]);
    expect(save).toHaveBeenCalledWith(
      AvancesProduccion,
      expect.objectContaining({ cantidad_producida: 2.5 }),
    );
  });

  it('permite completar exactamente la cantidad solicitada', async () => {
    query.mockResolvedValue([{ acumulado: '7.5000' }]);

    const resultado = await service.create(dto(2.5), usuario);

    expect(resultado.cantidad_producida_acumulada).toBe(10);
    expect(resultado.cantidad_pendiente).toBe(0);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rechaza el exceso y no inserta el avance', async () => {
    query.mockResolvedValue([{ acumulado: '8.0000' }]);

    await expect(service.create(dto(2.0001), usuario)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('bloquea la orden antes de sumar e insertar, y usa su ID y cantidad', async () => {
    const secuencia: string[] = [];
    findOne.mockImplementation(async () => {
      secuencia.push('orden-bloqueada');
      return ordenBase;
    });
    query.mockImplementation(async () => {
      secuencia.push('acumulado');
      return [{ acumulado: '1.0000' }];
    });
    save.mockImplementation(async (_entity: unknown, values: object) => {
      secuencia.push('insertado');
      return { id: '71', ...values };
    });

    const resultado = await service.create(dto(2, 42), usuario);

    expect(findOne).toHaveBeenCalledWith(OrdenProduccion, {
      where: { id: 42 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(secuencia).toEqual(['orden-bloqueada', 'acumulado', 'insertado']);
    expect(resultado.cantidad_solicitada).toBe(10);
    expect(query).toHaveBeenCalledWith(expect.any(String), [ordenBase.id]);
  });

  it('propaga el error de persistencia para que la transacción haga rollback', async () => {
    const error = new Error('falló la inserción');
    save.mockRejectedValue(error);

    await expect(service.create(dto(1), usuario)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('AvancesProduccionService.obtenerResumenPorOrden (ABC-318)', () => {
  const query = jest.fn();
  let service: AvancesProduccionService;

  const registro = (
    id: string,
    cantidad: string,
    fecha: string,
    ordenId = '42',
  ) => ({
    id,
    orden_id: ordenId,
    cantidad_producida: cantidad,
    fecha_hora: fecha,
    usuario_responsable_id: '9',
    usuario_responsable_nombre: 'Ana',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AvancesProduccionService({
      manager: { query },
    } as unknown as Repository<OrdenProduccion>);
  });

  it('devuelve 60 de 100, 40 pendientes y 60 por ciento sin duplicar registros', async () => {
    query.mockResolvedValue([
      {
        orden_id: '42',
        orden_codigo: 'OP-042',
        cantidad_solicitada: '100.0000',
        cantidad_producida: '60.0000',
        registros: [
          registro('2', '40.0000', '2026-11-06T11:00:00.000Z'),
          registro('1', '20.0000', '2026-11-06T10:00:00.000Z'),
        ],
      },
    ]);

    await expect(service.obtenerResumenPorOrden(42)).resolves.toEqual({
      orden_id: 42,
      orden_codigo: 'OP-042',
      cantidad_solicitada: 100,
      cantidad_producida: 60,
      cantidad_pendiente: 40,
      porcentaje_avance: 60,
      registros: [
        { ...registro('2', '40.0000', '2026-11-06T11:00:00.000Z'), cantidad_producida: 40 },
        { ...registro('1', '20.0000', '2026-11-06T10:00:00.000Z'), cantidad_producida: 20 },
      ],
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY r.fecha_hora DESC, r.id DESC'),
      [42],
    );
  });

  it('devuelve cero y una lista vacia cuando la orden no tiene avances', async () => {
    query.mockResolvedValue([
      {
        orden_id: '42',
        orden_codigo: 'OP-042',
        cantidad_solicitada: '100.0000',
        cantidad_producida: '0',
        registros: [],
      },
    ]);

    const resultado = await service.obtenerResumenPorOrden(42);

    expect(resultado).toMatchObject({
      cantidad_solicitada: 100,
      cantidad_producida: 0,
      cantidad_pendiente: 100,
      porcentaje_avance: 0,
      registros: [],
    });
  });

  it('responde 404 cuando la orden no existe', async () => {
    query.mockResolvedValue([]);

    await expect(service.obtenerResumenPorOrden(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['0', 0],
    ['-5.0000', 0],
    ['dato-invalido', 0],
  ])(
    'controla el denominador solicitado %s y devuelve porcentaje %s',
    async (solicitada, porcentaje) => {
      query.mockResolvedValue([
        {
          orden_id: '42',
          orden_codigo: 'OP-042',
          cantidad_solicitada: solicitada,
          cantidad_producida: '0',
          registros: [],
        },
      ]);

      const resultado = await service.obtenerResumenPorOrden(42);

      expect(resultado.porcentaje_avance).toBe(porcentaje);
      expect(resultado.cantidad_solicitada).toBe(0);
      expect(resultado.cantidad_pendiente).toBe(0);
    },
  );

  it('calcula decimales con precision y limita el porcentaje a cien', async () => {
    query
      .mockResolvedValueOnce([
        {
          orden_id: '42',
          orden_codigo: 'OP-042',
          cantidad_solicitada: '1.0000',
          cantidad_producida: '0.3000',
          registros: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          orden_id: '42',
          orden_codigo: 'OP-042',
          cantidad_solicitada: '100.0000',
          cantidad_producida: '125.0000',
          registros: [],
        },
      ]);

    await expect(service.obtenerResumenPorOrden(42)).resolves.toMatchObject({
      cantidad_producida: 0.3,
      cantidad_pendiente: 0.7,
      porcentaje_avance: 30,
    });
    await expect(service.obtenerResumenPorOrden(42)).resolves.toMatchObject({
      cantidad_producida: 125,
      cantidad_pendiente: 0,
      porcentaje_avance: 100,
    });
  });

  it('filtra por la orden solicitada y no ejecuta ninguna escritura', async () => {
    query.mockResolvedValue([
      {
        orden_id: '7',
        orden_codigo: 'OP-007',
        cantidad_solicitada: '10.0000',
        cantidad_producida: '2.0000',
        registros: [registro('1', '2.0000', '2026-11-06T10:00:00.000Z', '7')],
      },
    ]);

    await service.obtenerResumenPorOrden(7);

    const [sql, parametros] = query.mock.calls[0];
    expect(sql).toContain('WHERE a.orden_id = $1');
    expect(sql).toContain('WHERE o.id = $1');
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(parametros).toEqual([7]);
  });
});
