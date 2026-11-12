import { randomUUID } from 'crypto';
import { CierreProduccion } from '../../cierre-produccion/entities/cierre-produccion.entity';
import { PRODUCCION_CERRADA_V1, ProduccionCerradaV1Event } from '../contratos/contabilidad-v1';
import { calcularCostoBase } from './calcular-costo-base';

// `precios` (materialId -> costo unitario BOB o null) se lee del catalogo al cerrar;
// el snapshot no se modifica: el costo solo queda congelado en el payload del outbox.
export function crearEventoProduccionCerrada(
  cierre: CierreProduccion,
  precios: ReadonlyMap<string, string | null> = new Map(),
): ProduccionCerradaV1Event {
  const { consumos, costoBase } = calcularCostoBase(cierre.consumos, precios);
  return {
    eventId: randomUUID(),
    eventType: PRODUCCION_CERRADA_V1,
    occurredAt: cierre.fechaCierre.toISOString(),
    source: 'produccion-service',
    correlationId: randomUUID(),
    data: {
      cierreId: cierre.id,
      cierreVersion: cierre.cierreVersion,
      resumenId: cierre.id,
      ordenId: Number(cierre.ordenId),
      ordenCodigo: cierre.ordenCodigo,
      producto: { ...cierre.producto },
      cantidadSolicitada: cierre.cantidadSolicitada,
      cantidadConforme: cierre.cantidadConforme,
      consumos,
      costoBase,
      finalizadaAt: cierre.finalizadaAt.toISOString(),
    },
  };
}
