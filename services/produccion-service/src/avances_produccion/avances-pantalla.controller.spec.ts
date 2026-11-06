import 'reflect-metadata';

import { PERMISO_PRODUCCION } from '../auth/permiso-produccion.guard';
import { AvancesPantallaController } from './avances-pantalla.controller';
import { AvancesProduccionService } from './avances_produccion.service';

describe('AvancesPantallaController (ABC-318)', () => {
  it('delega el resumen de la orden al servicio sin alterar la respuesta', async () => {
    const respuesta = {
      orden_id: 42,
      orden_codigo: 'OP-042',
      cantidad_solicitada: 100,
      cantidad_producida: 60,
      cantidad_pendiente: 40,
      porcentaje_avance: 60,
      registros: [],
    };
    const obtenerResumenPorOrden = jest.fn().mockResolvedValue(respuesta);
    const controller = new AvancesPantallaController({
      obtenerResumenPorOrden,
    } as unknown as AvancesProduccionService);

    await expect(controller.obtenerResumen(42)).resolves.toBe(respuesta);
    expect(obtenerResumenPorOrden).toHaveBeenCalledTimes(1);
    expect(obtenerResumenPorOrden).toHaveBeenCalledWith(42);
  });

  it('exige el permiso de consulta de ordenes', () => {
    expect(
      Reflect.getMetadata(
        PERMISO_PRODUCCION,
        AvancesPantallaController.prototype.obtenerResumen,
      ),
    ).toBe('ordenes.consultar');
  });
});
