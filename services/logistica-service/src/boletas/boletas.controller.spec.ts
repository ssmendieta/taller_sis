import 'reflect-metadata';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { BoletasController } from './boletas.controller';

describe('BoletasController', () => {
  it('protege las rutas y asigna permisos por operación', () => {
    const guards = Reflect.getMetadata('__guards__', BoletasController) as unknown[];
    expect(guards).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, BoletasController.prototype.create)).toBe('logistica.boletas.gestionar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, BoletasController.prototype.updateItems)).toBe('logistica.boletas.gestionar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, BoletasController.prototype.emitir)).toBe('logistica.boletas.gestionar');
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

  it('delega findAll al servicio propagando query y autorización', async () => {
    const query = { page: 2, limit: 15, ordenId: '8' };
    const result = { items: [], total: 0, page: 2, limit: 15, totalPages: 0 };
    const service = { findAll: jest.fn().mockResolvedValue(result) };
    const controller = new BoletasController(service as any);

    await expect(controller.findAll(
      query as any,
      { headers: { authorization: 'Bearer token-test' } },
    )).resolves.toBe(result);

    expect(service.findAll).toHaveBeenCalledWith(query, 'Bearer token-test');
  });
});

describe('ABC-224: emisión protegida de boletas', () => {
  it('expone la emisión con permiso de gestión y la identidad autenticada', async () => {
    const emitir = jest.fn().mockResolvedValue({ id: '10', estado: 'EMITIDA' });
    const controller = new BoletasController({ emitir } as any);

    await expect(controller.emitir('10', {
      usuarioId: '42',
      headers: { authorization: 'Bearer token' },
    })).resolves.toMatchObject({ estado: 'EMITIDA' });
    expect(emitir).toHaveBeenCalledWith('10', '42', 'Bearer token');
  });
});