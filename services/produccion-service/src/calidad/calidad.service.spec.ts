import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { CalidadService } from './calidad.service';
import { ResultadoConforme } from './entities/resultado-conforme.entity';

describe('ABC-82: consulta de resultados conformes persistidos', () => {
  const find = jest.fn();
  const existsBy = jest.fn();
  const service = new CalidadService(
    { find } as unknown as Repository<ResultadoConforme>,
    { getRepository: () => ({ existsBy }) } as unknown as DataSource,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    existsBy.mockResolvedValue(true);
    find.mockResolvedValue([]);
  });

  it('consulta registros separados de la orden con cantidad, responsable y fecha', async () => {
    const resultados = [
      { id: '1', ordenId: '15', cantidad: '10.0000', responsableUsuarioId: '42', fechaHora: new Date('2026-10-12T15:30:00Z') },
      { id: '2', ordenId: '15', cantidad: '13.0000', responsableUsuarioId: '43', fechaHora: new Date('2026-10-12T16:30:00Z') },
    ];
    find.mockResolvedValue(resultados);
    await expect(service.consultarConformes(15)).resolves.toEqual(resultados);
    expect(existsBy).toHaveBeenCalledWith({ id: 15 });
    expect(find).toHaveBeenCalledWith({ where: { ordenId: '15' }, order: { fechaHora: 'ASC', id: 'ASC' } });
  });

  it('devuelve una lista vacia si la orden no tiene resultados conformes', async () => {
    await expect(service.consultarConformes(8)).resolves.toEqual([]);
  });

  it('rechaza una orden inexistente sin consultar resultados', async () => {
    existsBy.mockResolvedValue(false);
    await expect(service.consultarConformes(999)).rejects.toBeInstanceOf(NotFoundException);
    expect(find).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, 1.5])('rechaza el identificador invalido %s', async (id) => {
    await expect(service.consultarConformes(id)).rejects.toBeInstanceOf(BadRequestException);
    expect(existsBy).not.toHaveBeenCalled();
  });
});
