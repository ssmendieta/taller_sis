import 'reflect-metadata';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { BoletasController } from './boletas.controller';

describe('ABC-224: emisión protegida de boletas', () => {
  it('expone la emisión con permiso de gestión y la identidad autenticada', async () => {
    const emitir = jest.fn().mockResolvedValue({ id: '10', estado: 'EMITIDA' });
    const controller = new BoletasController({ emitir } as any);

    expect(Reflect.getMetadata(PERMISO_LOGISTICA, BoletasController.prototype.emitir))
      .toBe('logistica.boletas.gestionar');
    await expect(controller.emitir('10', {
      usuarioId: '42',
      headers: { authorization: 'Bearer token' },
    })).resolves.toMatchObject({ estado: 'EMITIDA' });
    expect(emitir).toHaveBeenCalledWith('10', '42', 'Bearer token');
  });
});
