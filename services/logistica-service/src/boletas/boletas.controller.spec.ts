import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { BoletasController } from './boletas.controller';

describe('BoletasController', () => {
  it('protege las cuatro rutas y asigna permisos por operación', () => {
    const guards = Reflect.getMetadata('__guards__', BoletasController) as unknown[];
    expect(guards).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, BoletasController.prototype.create)).toBe('logistica.boletas.gestionar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, BoletasController.prototype.updateItems)).toBe('logistica.boletas.gestionar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, BoletasController.prototype.findAll)).toBe('logistica.boletas.consultar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, BoletasController.prototype.findOne)).toBe('logistica.boletas.consultar');
  });

  it('delega updateItems al servicio propagando id, dto, usuario y autorización', async () => {
    const dto = { items: [{ referencia: 'L-1', cantidad: '5.0000' }] };
    const result = { id: '10', numero: 'BOL-2026-00001', items: [] };
    const service = { updateItems: jest.fn().mockResolvedValue(result) };
    const controller = new BoletasController(service as any);

    await expect(controller.updateItems(
      '10',
      dto,
      { usuarioId: '42', headers: { authorization: 'Bearer token-test' } },
    )).resolves.toBe(result);

    expect(service.updateItems).toHaveBeenCalledWith('10', dto, '42', 'Bearer token-test');
  });

  it('delega create al servicio propagando dto, usuario y autorización', async () => {
    const dto = { solicitudSalidaId: '7', items: [{ referencia: 'L-1', cantidad: '10.0000' }] };
    const result = { id: '10', numero: 'BOL-2026-00001', items: [] };
    const service = { create: jest.fn().mockResolvedValue(result) };
    const controller = new BoletasController(service as any);

    await expect(controller.create(
      dto,
      { usuarioId: '42', headers: { authorization: 'Bearer token-test' } },
    )).resolves.toBe(result);

    expect(service.create).toHaveBeenCalledWith(dto, '42', 'Bearer token-test');
  });
});
