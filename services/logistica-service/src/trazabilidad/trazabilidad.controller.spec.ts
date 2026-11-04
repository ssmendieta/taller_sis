import 'reflect-metadata';
import { PERMISO_LOGISTICA } from '../auth/permiso-logistica.guard';
import { TrazabilidadController } from './trazabilidad.controller';
import { TrazabilidadService } from './trazabilidad.service';

describe('TrazabilidadController', () => {
  it('protege las rutas con PermisoLogisticaGuard y exige logistica.boletas.consultar', () => {
    const guards = Reflect.getMetadata('__guards__', TrazabilidadController) as unknown[];
    expect(guards).toHaveLength(1);
    expect(Reflect.getMetadata(PERMISO_LOGISTICA, TrazabilidadController.prototype.consultar)).toBe(
      'logistica.boletas.consultar',
    );
  });

  it('delega consultar al servicio propagando query y autorización', async () => {
    const query = { ordenId: '8', loteId: 'L-7' };
    const result = [
      {
        id: '1',
        boletaId: '1',
        numero: 'BOL-2026-00001',
        fecha: '2026-10-18T14:30:00.000Z',
        naturaleza: 'Documento de salida / logística',
        ordenId: '8',
        orden: 'ORD-7',
        solicitudId: '1',
        destino: 'Almacén Central B',
        cantidad: '10.0000',
        unidad: 'unidades',
        lote: 'L-7',
        loteCodigo: 'L-7',
        loteId: 'L-7',
        estado: 'EMITIDA',
        items: [],
        historial: [],
      },
    ];

    const service = { consultar: jest.fn().mockResolvedValue(result) };
    const controller = new TrazabilidadController(service as unknown as TrazabilidadService);

    const respuesta = await controller.consultar(query, {
      headers: { authorization: 'Bearer token-supervisor' },
    });

    expect(respuesta).toBe(result);
    expect(service.consultar).toHaveBeenCalledWith(query, 'Bearer token-supervisor');
  });
});
