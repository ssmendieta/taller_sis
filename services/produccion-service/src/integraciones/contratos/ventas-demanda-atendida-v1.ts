import type { PubSubEvent } from '../pubsub/pubsub.types';

export const DEMANDA_ATENDIDA_V1 = 'DemandaAtendida.v1' as const;

export interface DemandaAtendidaV1Item {
  productoCodigo: string;
  cantidadAtendida: string;
  unidad: string;
}

export interface DemandaAtendidaV1Data {
  demandaId: string;
  origen: 'VENTAS' | 'FACTURACION';
  demandaExternaId: string;
  items: DemandaAtendidaV1Item[];
  fechaAtencion: string;
}

export type DemandaAtendidaV1Event = PubSubEvent<DemandaAtendidaV1Data> & {
  eventType: typeof DEMANDA_ATENDIDA_V1;
};

export const DEMANDA_ATENDIDA_V1_EJEMPLO: DemandaAtendidaV1Event = {
  eventId: '8d2a4f6b-3c1e-4b7a-9e5d-1f0a2b3c4d5e',
  eventType: DEMANDA_ATENDIDA_V1,
  occurredAt: '2026-11-20T15:30:00.000Z',
  source: 'produccion-service',
  correlationId: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  data: {
    demandaId: '12',
    origen: 'VENTAS',
    demandaExternaId: 'PED-2026-0042',
    items: [
      { productoCodigo: 'PROD-001', cantidadAtendida: '10.0000', unidad: 'UN' },
      { productoCodigo: 'PROD-002', cantidadAtendida: '2.5000', unidad: 'KG' },
    ],
    fechaAtencion: '2026-11-20T15:29:58.000Z',
  },
};
