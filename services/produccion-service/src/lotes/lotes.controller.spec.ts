import 'reflect-metadata';
import { LotesController } from './lotes.controller';
import { PERMISO_PRODUCCION, PermisoProduccionGuard } from '../auth/permiso-produccion.guard';
import { LotesService } from './lotes.service';

describe('LotesController (ABC-296: exposición de consulta de lotes)', () => {
  let controller: LotesController;
  let lotesService: Partial<LotesService>;

  beforeEach(() => {
    lotesService = {
      findByOrderCode: jest.fn().mockResolvedValue([
        {
          id: '4',
          codigo: 'L-1',
          ordenId: '8',
          ordenCodigo: 'ORD-7',
          productoId: '3',
          cantidad: '10.0000',
          fechaHora: '2026-10-13T00:00:00.000Z',
        },
      ]),
    };
    controller = new LotesController(lotesService as LotesService);
  });

  it('protege el controlador con PermisoProduccionGuard', () => {
    const guards = Reflect.getMetadata('__guards__', LotesController);
    expect(guards).toContain(PermisoProduccionGuard);
  });

  it('asigna el permiso requerido ordenes.consultar al endpoint consultarPorOrden', () => {
    const permiso = Reflect.getMetadata(
      PERMISO_PRODUCCION,
      LotesController.prototype.consultarPorOrden,
    );
    expect(permiso).toBe('ordenes.consultar');
  });

  it('delega la consulta por código de orden a LotesService', async () => {
    const resultado = await controller.consultarPorOrden('ORD-7');
    expect(lotesService.findByOrderCode).toHaveBeenCalledWith('ORD-7');
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      codigo: 'L-1',
      ordenCodigo: 'ORD-7',
      productoId: '3',
    });
  });
});
