import { ConflictException } from '@nestjs/common';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { EstadoEntrega } from './estado-entrega.enum';

// ABC-375: máquina de estados de la ruta y de cada entrega individual.

export const TRANSICIONES_RUTA_PERMITIDAS: Record<EstadoRuta, EstadoRuta[]> = {
  [EstadoRuta.PLANIFICADA]: [EstadoRuta.DESPACHADA, EstadoRuta.CANCELADA],
  [EstadoRuta.DESPACHADA]: [EstadoRuta.COMPLETADA],
  [EstadoRuta.COMPLETADA]: [],
  [EstadoRuta.CANCELADA]: [],
};

export const TRANSICIONES_ENTREGA_PERMITIDAS: Record<EstadoEntrega, EstadoEntrega[]> = {
  [EstadoEntrega.PENDIENTE]: [EstadoEntrega.ENTREGADA, EstadoEntrega.ANULADA],
  [EstadoEntrega.ENTREGADA]: [],
  [EstadoEntrega.ANULADA]: [],
};

export function esTransicionRutaValida(actual: EstadoRuta, siguiente: EstadoRuta): boolean {
  return (TRANSICIONES_RUTA_PERMITIDAS[actual] ?? []).includes(siguiente);
}

export function esTransicionEntregaValida(actual: EstadoEntrega, siguiente: EstadoEntrega): boolean {
  return (TRANSICIONES_ENTREGA_PERMITIDAS[actual] ?? []).includes(siguiente);
}

/** Lanza 409 si la ruta ya está en ese estado (duplicado) o la transición no existe. */
export function validarTransicionRuta(actual: EstadoRuta, siguiente: EstadoRuta): void {
  if (actual === siguiente) {
    throw new ConflictException(`La ruta ya está en estado ${actual}`);
  }
  if (!esTransicionRutaValida(actual, siguiente)) {
    throw new ConflictException(`Transición de ruta no permitida: ${actual} → ${siguiente}`);
  }
}

/**
 * Una entrega solo se marca ENTREGADA con la ruta en camino (DESPACHADA);
 * puede anularse mientras la ruta siga activa.
 */
export function validarTransicionEntrega(
  estadoRuta: EstadoRuta,
  actual: EstadoEntrega,
  siguiente: EstadoEntrega,
): void {
  if (actual === siguiente) {
    throw new ConflictException(`La entrega ya está en estado ${actual}`);
  }
  if (!esTransicionEntregaValida(actual, siguiente)) {
    throw new ConflictException(`Transición de entrega no permitida: ${actual} → ${siguiente}`);
  }
  if (siguiente === EstadoEntrega.ENTREGADA && estadoRuta !== EstadoRuta.DESPACHADA) {
    throw new ConflictException(`Solo se entrega en una ruta DESPACHADA (estado actual: ${estadoRuta})`);
  }
  if (siguiente === EstadoEntrega.ANULADA &&
      ![EstadoRuta.PLANIFICADA, EstadoRuta.DESPACHADA].includes(estadoRuta)) {
    throw new ConflictException(`No se puede anular una entrega de una ruta ${estadoRuta}`);
  }
}

/** Una ruta se despacha solo si tiene al menos una entrega pendiente. */
export function validarDespacho(estadoRuta: EstadoRuta, entregas: EstadoEntrega[]): void {
  validarTransicionRuta(estadoRuta, EstadoRuta.DESPACHADA);
  if (!entregas.includes(EstadoEntrega.PENDIENTE)) {
    throw new ConflictException('La ruta no tiene entregas pendientes para despachar');
  }
}

/**
 * Estado que corresponde a una ruta DESPACHADA según sus entregas: se cierra
 * cuando todas las entregas válidas (no anuladas) están ENTREGADAS. Una entrega
 * parcial deja la ruta DESPACHADA.
 */
export function estadoRutaSegunEntregas(entregas: EstadoEntrega[]): EstadoRuta {
  const validas = entregas.filter((estado) => estado !== EstadoEntrega.ANULADA);
  const completa = validas.length > 0 && validas.every((estado) => estado === EstadoEntrega.ENTREGADA);
  return completa ? EstadoRuta.COMPLETADA : EstadoRuta.DESPACHADA;
}
