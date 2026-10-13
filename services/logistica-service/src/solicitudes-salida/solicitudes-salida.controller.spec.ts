import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { SolicitudesSalidaController } from './solicitudes-salida.controller';

describe('SolicitudesSalidaController', () => {
  it('protege las tres rutas y asigna permisos por operación', () => {
    const controller = Reflect.getMetadata('__guards__', SolicitudesSalidaController) as unknown[];
    expect(controller).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, SolicitudesSalidaController.prototype.create)).toBe('logistica.boletas.gestionar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, SolicitudesSalidaController.prototype.findAll)).toBe('logistica.boletas.consultar');
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, SolicitudesSalidaController.prototype.findOne)).toBe('logistica.boletas.consultar');
  });

  it('toma el responsable de la sesión y delega la creación al servicio', async () => {
    const dto = {
      ordenId: '3', destinoDocumental: 'Archivo', motivo: 'Trámite',
      items: [{ referencia: 'LOTE-4', cantidad: '1.0000' }],
    };
    const result = { id: '1' };
    const service = { create: jest.fn().mockResolvedValue(result) };
    const controller = new SolicitudesSalidaController(service as any);
    await expect(controller.create(dto, { usuarioId: '99' })).resolves.toBe(result);
    expect(service.create).toHaveBeenCalledWith(dto, '99');
  });
});
