import { ConsumosMaterialService } from './consumos-material.service';

describe('ConsumosMaterialService: acumulación y permisos', () => {
  it('conserva dos registros independientes de 10 y 13 kg y verifica el total de 23 kg', async () => {
    const registros = [
      { id: '1', ordenId: '1', materialId: '1', cantidad: '10.0000', unidad: 'kg', usuarioRegistroId: '42' },
      { id: '2', ordenId: '1', materialId: '1', cantidad: '13.0000', unidad: 'kg', usuarioRegistroId: '43' },
    ];

    const consumosRepository = {
      find: jest.fn().mockResolvedValue(registros),
      createQueryBuilder: jest.fn(() => {
        const query = {
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          addGroupBy: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([
            { ordenId: '1', materialId: '1', unidad: 'kg', cantidadTotal: '23.0000' },
          ]),
        };
        return query;
      }),
    };

    const dataSource = {
      getRepository: jest.fn(() => ({
        existsBy: jest.fn().mockResolvedValue(true),
      })),
    };

    const service = new ConsumosMaterialService(
      consumosRepository as any,
      dataSource as any,
    );

    const resultado = await service.findByOrden(1, 1);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((registro) => registro.cantidad)).toEqual(['10.0000', '13.0000']);
    expect(resultado.map((registro) => registro.usuarioRegistroId)).toEqual(['42', '43']);
    expect(resultado[0].id).not.toBe(resultado[1].id);

    const totales = await service.totales(1, 1);
    expect(totales).toEqual([
      { ordenId: '1', materialId: '1', unidad: 'kg', cantidadTotal: '23.0000' },
    ]);
  });
});
