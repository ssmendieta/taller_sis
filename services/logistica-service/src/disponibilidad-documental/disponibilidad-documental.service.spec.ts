import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { DisponibilidadDocumentalService } from './disponibilidad-documental.service';
import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';

describe('ABC-209: saldo documental', () => {
  const getRawOne = jest.fn();
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne,
  };
  const boletas = { createQueryBuilder: jest.fn(() => queryBuilder) } as any;
  const produccion = {
    consultarOrdenPorCodigo: jest.fn().mockResolvedValue({ id: '8', codigo: 'ORD-7', producto_id: 3 }),
    consultarConformesPorOrden: jest.fn().mockResolvedValue([{ cantidad: '10.0000' }, { cantidad: '5.2500' }]),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    getRawOne.mockResolvedValue({ total: '4.2500' });
    produccion.consultarOrdenPorCodigo.mockResolvedValue({ id: '8', codigo: 'ORD-7', producto_id: 3 });
    produccion.consultarConformesPorOrden.mockResolvedValue([{ cantidad: '10.0000' }, { cantidad: '5.2500' }]);
  });

  it('calcula saldo positivo con precisión decimal y filtra EMITIDA', async () => {
    const result = await new DisponibilidadDocumentalService(boletas, produccion).consultar('ORD-7', 'Bearer token');
    expect(produccion.consultarConformesPorOrden).toHaveBeenCalledWith('8', 'Bearer token');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('boleta.estado = :estado', { estado: EstadoBoleta.EMITIDA });
    expect(result).toMatchObject({ totalConforme: '15.2500', totalEmitido: '4.2500', saldoDocumental: '11.0000' });
  });

  it('devuelve saldo cero cuando las emitidas consumen todos los conformes', async () => {
    getRawOne.mockResolvedValueOnce({ total: '15.2500' });
    const result = await new DisponibilidadDocumentalService(boletas, produccion).consultar('ORD-7', 'Bearer token');
    expect(result.saldoDocumental).toBe('0.0000');
  });

  it('excluye borradores y anuladas porque el SQL solo usa EMITIDA', async () => {
    getRawOne.mockResolvedValueOnce({ total: '0' });
    const result = await new DisponibilidadDocumentalService(boletas, produccion).consultar('ORD-7', 'Bearer token');
    expect(result.saldoDocumental).toBe('15.2500');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('boleta.estado = :estado', { estado: 'EMITIDA' });
  });

  it('maneja una orden sin boletas emitidas', async () => {
    getRawOne.mockResolvedValueOnce({ total: '0' });
    await expect(new DisponibilidadDocumentalService(boletas, produccion).consultar('ORD-7', 'Bearer token'))
      .resolves.toMatchObject({ totalEmitido: '0.0000' });
  });

  it('no convierte una respuesta incompleta o una caída de Producción en saldo cero', async () => {
    produccion.consultarOrdenPorCodigo.mockRejectedValueOnce(new BadGatewayException('formato inválido'));
    await expect(new DisponibilidadDocumentalService(boletas, produccion).consultar('ORD-7', 'Bearer token'))
      .rejects.toBeInstanceOf(BadGatewayException);
    produccion.consultarOrdenPorCodigo.mockRejectedValueOnce(new ServiceUnavailableException('timeout'));
    await expect(new DisponibilidadDocumentalService(boletas, produccion).consultar('ORD-7', 'Bearer token'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(getRawOne).not.toHaveBeenCalled();
  });
});
