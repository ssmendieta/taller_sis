import { randomUUID } from 'crypto';
import { DEMANDA_ATENDIDA_V1, DemandaAtendidaV1Event, DemandaAtendidaV1Item } from '../contratos/ventas-demanda-atendida-v1';
import { validarDemandaAtendidaV1 } from '../contratos/ventas-demanda-atendida-v1.validator';

export interface DemandaAtendidaDatos {
  demandaId: string;
  origen: 'VENTAS' | 'FACTURACION';
  demandaExternaId: string;
  items: DemandaAtendidaV1Item[];
  fechaAtencion: Date;
}

// ABC-432: se construye una sola vez, dentro de la transacción que deja la demanda
// atendida. El publicador reutiliza este payload y su eventId en los reintentos.
export function crearEventoDemandaAtendida(datos: DemandaAtendidaDatos): DemandaAtendidaV1Event {
  return validarDemandaAtendidaV1({
    eventId: randomUUID(),
    eventType: DEMANDA_ATENDIDA_V1,
    occurredAt: datos.fechaAtencion.toISOString(),
    source: 'produccion-service',
    correlationId: randomUUID(),
    data: {
      demandaId: datos.demandaId,
      origen: datos.origen,
      demandaExternaId: datos.demandaExternaId,
      items: datos.items,
      fechaAtencion: datos.fechaAtencion.toISOString(),
    },
  });
}
