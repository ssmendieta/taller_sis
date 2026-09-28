import { EstadoOrden } from './estado-orden.enum';
import {
  TRANSICIONES_PERMITIDAS,
  esTransicionValida,
} from './estado-orden.transiciones';

describe('flujo de estados de orden (esTransicionValida)', () => {
  it.each([
    [EstadoOrden.PENDIENTE, EstadoOrden.PLANIFICADA],
    [EstadoOrden.PENDIENTE, EstadoOrden.CANCELADA],
    [EstadoOrden.PLANIFICADA, EstadoOrden.EN_PRODUCCION],
    [EstadoOrden.PLANIFICADA, EstadoOrden.CANCELADA],
    [EstadoOrden.EN_PRODUCCION, EstadoOrden.FINALIZADA],
    [EstadoOrden.EN_PRODUCCION, EstadoOrden.CANCELADA],
  ])('acepta %s -> %s', (actual, siguiente) => {
    expect(esTransicionValida(actual, siguiente)).toBe(true);
  });

  it.each([
    // Saltos hacia adelante omitiendo estados intermedios
    [EstadoOrden.PENDIENTE, EstadoOrden.EN_PRODUCCION],
    [EstadoOrden.PENDIENTE, EstadoOrden.FINALIZADA],
    [EstadoOrden.PLANIFICADA, EstadoOrden.FINALIZADA],
    [EstadoOrden.PLANIFICADA, EstadoOrden.PENDIENTE],
    // Retrocesos
    [EstadoOrden.EN_PRODUCCION, EstadoOrden.PLANIFICADA],
    [EstadoOrden.EN_PRODUCCION, EstadoOrden.PENDIENTE],
    // Auto-transiciones (permanecer en el mismo estado no es una transición)
    [EstadoOrden.PENDIENTE, EstadoOrden.PENDIENTE],
    [EstadoOrden.PLANIFICADA, EstadoOrden.PLANIFICADA],
    [EstadoOrden.EN_PRODUCCION, EstadoOrden.EN_PRODUCCION],
    [EstadoOrden.FINALIZADA, EstadoOrden.FINALIZADA],
    [EstadoOrden.CANCELADA, EstadoOrden.CANCELADA],
    // Salidas desde estados terminales
    [EstadoOrden.FINALIZADA, EstadoOrden.CANCELADA],
    [EstadoOrden.FINALIZADA, EstadoOrden.PENDIENTE],
    [EstadoOrden.FINALIZADA, EstadoOrden.EN_PRODUCCION],
    [EstadoOrden.CANCELADA, EstadoOrden.PENDIENTE],
    [EstadoOrden.CANCELADA, EstadoOrden.PLANIFICADA],
    [EstadoOrden.CANCELADA, EstadoOrden.FINALIZADA],
  ])('rechaza %s -> %s', (actual, siguiente) => {
    expect(esTransicionValida(actual, siguiente)).toBe(false);
  });

  it('FINALIZADA y CANCELADA no tienen transiciones de salida', () => {
    expect(TRANSICIONES_PERMITIDAS[EstadoOrden.FINALIZADA]).toEqual([]);
    expect(TRANSICIONES_PERMITIDAS[EstadoOrden.CANCELADA]).toEqual([]);
  });

  it('el mapa cubre exactamente los 5 estados del CHECK constraint', () => {
    expect(Object.keys(TRANSICIONES_PERMITIDAS).sort()).toEqual(
      [
        EstadoOrden.PENDIENTE,
        EstadoOrden.PLANIFICADA,
        EstadoOrden.EN_PRODUCCION,
        EstadoOrden.FINALIZADA,
        EstadoOrden.CANCELADA,
      ].sort(),
    );
  });
});
