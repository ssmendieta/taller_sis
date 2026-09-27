import { EstadoOrden } from './estado-orden.enum';


export const TRANSICIONES_PERMITIDAS: Record<EstadoOrden, EstadoOrden[]> = {
  [EstadoOrden.PENDIENTE]: [EstadoOrden.PLANIFICADA, EstadoOrden.CANCELADA],
  [EstadoOrden.PLANIFICADA]: [EstadoOrden.EN_PRODUCCION, EstadoOrden.CANCELADA],
  [EstadoOrden.EN_PRODUCCION]: [EstadoOrden.FINALIZADA, EstadoOrden.CANCELADA],
  [EstadoOrden.FINALIZADA]: [],
  [EstadoOrden.CANCELADA]: [],
};

export function esTransicionValida(
  actual: EstadoOrden,
  siguiente: EstadoOrden,
): boolean {
  return (TRANSICIONES_PERMITIDAS[actual] ?? []).includes(siguiente);
}
