import { BadRequestException } from '@nestjs/common';
import { LotesService } from './lotes.service';

describe('ABC-296: consulta de lotes por código de orden', () => {
  const getMany = jest.fn();
  const queryBuilder = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany,
  };
  const dataSource = { getRepository: jest.fn().mockReturnValue({ createQueryBuilder: () => queryBuilder }) } as any;

  beforeEach(() => jest.clearAllMocks());

  it('devuelve datos persistidos de los lotes asociados a la orden', async () => {
    getMany.mockResolvedValue([{ id: '4', codigo: 'L-1', ordenId: '8', orden: { codigo: 'ORD-7', producto_id: 3 }, cantidad: '10.0000', fechaHora: new Date('2026-10-13T00:00:00Z') }]);
    const result = await new LotesService(dataSource).findByOrderCode(' ORD-7 ');
    expect(queryBuilder.where).toHaveBeenCalledWith('orden.codigo = :codigo', { codigo: 'ORD-7' });
    expect(result[0]).toMatchObject({ id: '4', codigo: 'L-1', ordenCodigo: 'ORD-7', productoId: '3', cantidad: '10.0000' });
  });

  it('rechaza un código vacío', async () => {
    await expect(new LotesService(dataSource).findByOrderCode('  ')).rejects.toBeInstanceOf(BadRequestException);
  });
});
