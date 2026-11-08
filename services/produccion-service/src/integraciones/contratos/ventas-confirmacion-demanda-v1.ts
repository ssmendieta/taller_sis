import { PubSubEvent } from '../pubsub/pubsub.types';

export const DEMANDA_CONFIRMADA_V1 = 'DemandaConfirmada.v1' as const;

export interface DemandaConfirmadaV1Data {
  origen: 'VENTAS' | 'FACTURACION';
  demandaExternaId: string;
}

export type DemandaConfirmadaV1Event = PubSubEvent<DemandaConfirmadaV1Data> & {
  eventType: typeof DEMANDA_CONFIRMADA_V1;
};

export const DEMANDA_CONFIRMADA_V1_EJEMPLO: DemandaConfirmadaV1Event = {
  eventId: '6f10860d-185d-4aa5-b676-b90f874ecf31',
  eventType: DEMANDA_CONFIRMADA_V1,
  occurredAt: '2026-11-07T14:30:00.000Z',
  source: 'ventas-service',
  correlationId: '7c1d2e3f-4a5b-4c6d-8e9f-a0b1c2d3e4f5',
  data: {
    origen: 'VENTAS',
    demandaExternaId: 'PED-2026-0042',
  },
};
