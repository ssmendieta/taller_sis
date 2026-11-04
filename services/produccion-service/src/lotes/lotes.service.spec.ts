import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResultadoConforme } from '../calidad/entities/resultado-conforme.entity';
import { TipoResultadoCalidad } from '../calidad/entities/tipo-resultado-calidad.enum';
import { OrdenProduccion } from '../ordenes/entities/orden-produccion.entity';
import { Lote } from './entities/lote.entity';
import { LotesService } from './lotes.service';

describe('ABC-294: regla de asignacion de conformes a lotes', () => {
  const conformes = {
    select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getRawOne: jest.fn(),
  };
  const asignados = {
    select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn(),
  };
  const existsBy = jest.fn();
  const manager = {
    findOne: jest.fn(), save: jest.fn(),
    getRepository: jest.fn((entity) => entity === ResultadoConforme
      ? { createQueryBuilder: () => conformes }
      : { existsBy, createQueryBuilder: () => asignados }),
  };
  const transaction = jest.fn(async (callback) => callback(manager));
  const service = new LotesService({ transaction } as unknown as DataSource);
  const dto = { ordenId: 1, codigo: 'L-001', cantidad: 23 };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (callback) => callback(manager));
    manager.findOne.mockResolvedValue({ id: 1 });
    existsBy.mockResolvedValue(false);
    conformes.getRawOne.mockResolvedValue({ total: '23.0000' });
    asignados.getRawOne.mockResolvedValue({ total: '0.0000' });
    manager.save.mockImplementation(async (_entity, values) => ({ id: '1', ...values, fechaHora: new Date() }));
  });

  it('asigna exactamente los conformes disponibles y toma responsable y fecha del servidor', async () => {
    const result = await service.create({ ...dto, codigo: ' L-001 ' }, 42);
    expect(result).toMatchObject({ codigo: 'L-001', ordenId: '1', cantidad: '23.0000', responsableUsuarioId: '42' });
    expect(result.fechaHora).toBeInstanceOf(Date);
    expect(manager.findOne).toHaveBeenCalledWith(OrdenProduccion, {
      where: { id: 1 }, lock: { mode: 'pessimistic_write' },
    });
    expect(conformes.andWhere).toHaveBeenCalledWith('resultado.tipo = :tipo', { tipo: TipoResultadoCalidad.CONFORME });
    expect(manager.save).toHaveBeenCalledWith(Lote, {
      codigo: 'L-001', ordenId: '1', cantidad: '23.0000', responsableUsuarioId: '42',
    });
  });

  it('409: codigo repetido no guarda otro lote', async () => {
    existsBy.mockResolvedValue(true);
    await expect(service.create(dto, 42)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('409: descuenta las cantidades ya asignadas del total conforme', async () => {
    asignados.getRawOne.mockResolvedValue({ total: '10.0000' });
    await expect(service.create({ ...dto, cantidad: 14 }, 42)).rejects.toMatchObject({ status: 409 });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('409: sin resultados conformes no asigna un lote', async () => {
    conformes.getRawOne.mockResolvedValue({ total: '0' });
    await expect(service.create({ ...dto, cantidad: 1 }, 42)).rejects.toMatchObject({ status: 409 });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('409: traduce el duplicado de BD tras el rollback de la transaccion', async () => {
    transaction.mockRejectedValueOnce({ driverError: { code: '23505', constraint: 'uq_lotes_codigo' } });
    await expect(service.create(dto, 42)).rejects.toMatchObject({ status: 409 });
  });

  it('conserva la precision de cantidades grandes y diferencias de 0.0001', async () => {
    conformes.getRawOne.mockResolvedValue({ total: '19999999999.9998' });
    asignados.getRawOne.mockResolvedValue({ total: '19999999999.9997' });
    expect((await service.create({ ...dto, cantidad: 0.0001 }, 42)).cantidad).toBe('0.0001');
    await expect(service.create({ ...dto, cantidad: 0.0002 }, 42)).rejects.toMatchObject({ status: 409 });
  });

  it('404: orden inexistente no guarda un lote', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(service.create(dto, 42)).rejects.toBeInstanceOf(NotFoundException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity, 0.00001, 1.12345, 10000000000])('400: cantidad invalida %s', async (cantidad) => {
    await expect(service.create({ ...dto, cantidad }, 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'L'.repeat(81), null])('400: codigo invalido %s', async (codigo) => {
    await expect(service.create({ ...dto, codigo }, 42)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('401: exige un responsable valido', async () => {
    await expect(service.create(dto, 0)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('propaga errores distintos al codigo duplicado', async () => {
    const error = new Error('Fallo de persistencia');
    manager.save.mockRejectedValueOnce(error);
    await expect(service.create(dto, 42)).rejects.toBe(error);
  });
});
