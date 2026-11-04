import { DataSource, Repository } from 'typeorm';
import { CierreProduccion } from './entities/cierre-produccion.entity';
import { CierreProduccionService } from './cierre-produccion.service';

describe('ABC-299: conflictos de persistencia y consulta del snapshot', () => {
  const transaction = jest.fn();
  const findOneBy = jest.fn();
  const existsBy = jest.fn();
  const source = { transaction, getRepository: () => ({ existsBy }) } as unknown as DataSource;
  const service = new CierreProduccionService({ findOneBy } as unknown as Repository<CierreProduccion>, source);

  beforeEach(() => jest.clearAllMocks());

  it('409: convierte el duplicado de BD despues del rollback', async () => {
    transaction.mockRejectedValueOnce({ driverError: { code: '23505', constraint: 'uq_cierres_produccion_orden_version' } });
    await expect(service.preparar({ ordenId: 1, cierreVersion: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it('409: un cambio concurrente incompatible permite reintentar sin confirmar un cierre parcial', async () => {
    transaction.mockRejectedValueOnce({ driverError: { code: '40001' } });
    await expect(service.preparar({ ordenId: 1, cierreVersion: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it('consulta directamente el snapshot guardado, sin volver a leer sus fuentes', async () => {
    const snapshot = { id: '1', ordenId: '1', cierreVersion: 1, cantidadProducida: '100.0000' };
    findOneBy.mockResolvedValueOnce(snapshot);
    await expect(service.consultar(1)).resolves.toBe(snapshot);
    expect(existsBy).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('404: distingue una orden inexistente de una version sin preparar', async () => {
    findOneBy.mockResolvedValueOnce(null);
    existsBy.mockResolvedValueOnce(false);
    await expect(service.consultar(999)).rejects.toMatchObject({ status: 404, message: 'Orden con id 999 no encontrada' });
    findOneBy.mockResolvedValueOnce(null);
    existsBy.mockResolvedValueOnce(true);
    await expect(service.consultar(1, 2)).rejects.toMatchObject({ status: 404, message: 'No existe un resumen de cierre para la orden 1 y versión 2' });
  });

  it.each([[0, 1], [1, 0], [1, 2147483648], [1.5, 1]])('400: referencia invalida orden=%s version=%s', async (ordenId, cierreVersion) => {
    await expect(service.preparar({ ordenId, cierreVersion })).rejects.toMatchObject({ status: 400 });
    await expect(service.consultar(ordenId, cierreVersion)).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
