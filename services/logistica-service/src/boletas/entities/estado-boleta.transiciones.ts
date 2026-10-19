import { EstadoBoleta } from './estado-boleta.enum';

export const TRANSICIONES_BOLETA_PERMITIDAS: Record<EstadoBoleta, EstadoBoleta[]> = {
  [EstadoBoleta.BORRADOR]: [EstadoBoleta.EMITIDA],
  [EstadoBoleta.EMITIDA]: [EstadoBoleta.ANULADA],
  [EstadoBoleta.ANULADA]: [],
};

export function esTransicionBoletaValida(
  actual: EstadoBoleta,
  siguiente: EstadoBoleta,
): boolean {
  return (TRANSICIONES_BOLETA_PERMITIDAS[actual] ?? []).includes(siguiente);
}
