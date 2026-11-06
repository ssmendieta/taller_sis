import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { RutasController } from './rutas.controller';

describe('ABC-370: RutasController', () => {
  it('protege todas las operaciones y separa permisos de gestión y consulta', () => {
    const guards = Reflect.getMetadata('__guards__', RutasController) as unknown[];
    expect(guards).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, RutasController.prototype.create)).toBe('logistica.rutas.gestionar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, RutasController.prototype.update)).toBe('logistica.rutas.gestionar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, RutasController.prototype.findAll)).toBe('logistica.rutas.consultar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, RutasController.prototype.findOne)).toBe('logistica.rutas.consultar');
  });

  it('toma el responsable de la sesión al crear', async () => {
    const service = { create: jest.fn().mockResolvedValue({ id: '1' }) };
    const controller = new RutasController(service as any);
    const dto = {
      grupoId: null, fechaProgramada: '2026-11-10', vehiculoExternoId: 'V', choferExternoId: 'C',
      paradas: [{ destino: 'A', boletaIds: ['1'] }],
    };
    await controller.create(dto, { usuarioId: '7' });
    expect(service.create).toHaveBeenCalledWith(dto, '7');
  });
});
