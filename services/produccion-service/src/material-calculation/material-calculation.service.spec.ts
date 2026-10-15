import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConsumosMaterialService } from '../consumos-material/consumos-material.service';
import { MaterialCalculationService } from './material-calculation.service';

describe('ABC-72: comparacion de materiales por orden', () => {
  const existsBy = jest.fn();
  const totales = jest.fn();
  const getRawMany = jest.fn();
  const findOneByOrFail = jest.fn();
  const query = {
    innerJoin: jest.fn(() => query), select: jest.fn(() => query), addSelect: jest.fn(() => query),
    where: jest.fn(() => query), orderBy: jest.fn(() => query), getRawMany,
  };
  const source = { getRepository: () => ({ existsBy, createQueryBuilder: () => query, findOneByOrFail }) } as unknown as DataSource;
  const service = new MaterialCalculationService(source, { totales } as unknown as ConsumosMaterialService);
  const requerido = { materialId: '1', materialCodigo: 'M1', materialNombre: 'Harina', unidad: 'kg', cantidadRequerida: '20.00000000' };

  beforeEach(() => {
    jest.clearAllMocks();
    existsBy.mockResolvedValue(true);
    getRawMany.mockResolvedValue([requerido]);
    totales.mockResolvedValue([]);
  });

  it('sin consumos devuelve cero y diferencia negativa', async () => {
    expect(await service.compararConsumoPorOrden(1)).toEqual({ ordenId: '1', materiales: [{
      ...requerido, cantidadRequerida: '20.0000', cantidadConsumida: '0.0000', diferencia: '-20.0000',
    }] });
  });

  it('reutiliza totales de ABC-71 y devuelve 23 consumidos menos 20 requeridos', async () => {
    totales.mockResolvedValue([{ ordenId: '1', materialId: '1', cantidadTotal: '23.0000', unidad: 'kg' }]);
    const result = await service.compararConsumoPorOrden(1);
    expect(result.materiales[0]).toMatchObject({ cantidadRequerida: '20.0000', cantidadConsumida: '23.0000', diferencia: '3.0000', unidad: 'kg' });
    expect(totales).toHaveBeenCalledWith(1);
  });

  it('409: no combina kg y g del mismo material', async () => {
    totales.mockResolvedValue([
      { materialId: '1', cantidadTotal: '10.0000', unidad: 'kg' },
      { materialId: '1', cantidadTotal: '13.0000', unidad: 'g' },
    ]);
    await expect(service.compararConsumoPorOrden(1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('mantiene separados materiales con unidades diferentes', async () => {
    getRawMany.mockResolvedValue([requerido, { ...requerido, materialId: '2', unidad: 'unidad', cantidadRequerida: '5.00000000' }]);
    totales.mockResolvedValue([
      { materialId: '1', cantidadTotal: '23.0000', unidad: 'kg' },
      { materialId: '2', cantidadTotal: '4.0000', unidad: 'unidad' },
    ]);
    const result = await service.compararConsumoPorOrden(1);
    expect(result.materiales.map((material) => [material.unidad, material.diferencia])).toEqual([['kg', '3.0000'], ['unidad', '-1.0000']]);
  });

  it('conserva ocho decimales del requerido y diferencias pequenas', async () => {
    getRawMany.mockResolvedValue([{ ...requerido, cantidadRequerida: '0.00000001' }]);
    totales.mockResolvedValue([{ materialId: '1', cantidadTotal: '0.0001', unidad: 'kg' }]);
    expect((await service.compararConsumoPorOrden(1)).materiales[0]).toMatchObject({ cantidadRequerida: '0.00000001', diferencia: '0.00009999' });
  });

  it('incluye un consumo historico que ya no aparece en la receta', async () => {
    getRawMany.mockResolvedValue([]);
    totales.mockResolvedValue([{ materialId: '1', cantidadTotal: '23.0000', unidad: 'kg' }]);
    findOneByOrFail.mockResolvedValue({ codigo: 'M1', nombre: 'Harina', unidadMedida: 'kg' });
    expect((await service.compararConsumoPorOrden(1)).materiales[0]).toMatchObject({ cantidadRequerida: '0.0000', cantidadConsumida: '23.0000', diferencia: '23.0000' });
  });

  it('404: orden inexistente', async () => {
    existsBy.mockResolvedValue(false);
    await expect(service.compararConsumoPorOrden(999)).rejects.toBeInstanceOf(NotFoundException);
    expect(totales).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, 1.5])('400: identificador invalido %s', async (ordenId) => {
    await expect(service.compararConsumoPorOrden(ordenId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('conserva el calculo existente por cantidad solicitada', () => {
    expect(service.calcularMateriales(2, [{ materialId: 1, cantidadRequerida: 10 }])).toEqual([{ materialId: 1, cantidadRequerida: 10, cantidadTotal: 20 }]);
  });
});
