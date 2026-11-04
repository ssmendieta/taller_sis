import { randomUUID } from 'crypto';
import { CierreProduccion } from '../../cierre-produccion/entities/cierre-produccion.entity';
import { PRODUCCION_CERRADA_V1, ProduccionCerradaV1Event } from '../contratos/contabilidad-v1';

export function crearEventoProduccionCerrada(cierre: CierreProduccion): ProduccionCerradaV1Event {
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
      consumos: cierre.consumos.map((consumo) => ({ ...consumo })),
      finalizadaAt: cierre.finalizadaAt.toISOString(),
    },
  };
}
