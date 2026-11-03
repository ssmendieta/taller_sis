import { PubSubEvent } from '../pubsub/pubsub.types';

// Contrato propuesto por Producción para ABC-122; debe confirmarse con Ventas/Facturación.
export const DEMANDA_REGISTRADA_V1 = 'DemandaRegistrada.v1' as const;

export interface DemandaItemV1 {
  productoCodigo: string;
  cantidad: string;
  unidad: string;
}

export interface DemandaRegistradaV1Data {
  origen: 'VENTAS' | 'FACTURACION';
  demandaExternaId: string;
  fechaRequerida: string;
  items: DemandaItemV1[];
}

export type DemandaRegistradaV1Event = PubSubEvent<DemandaRegistradaV1Data> & {
  eventType: typeof DEMANDA_REGISTRADA_V1;
};

export const DEMANDA_REGISTRADA_V1_EJEMPLO: DemandaRegistradaV1Event = {
  eventId: '0b8f5f8e-2b1a-4c55-9d0e-5f6b7c8d9e01',
  eventType: DEMANDA_REGISTRADA_V1,
  occurredAt: '2026-11-03T14:00:00.000Z',
  source: 'ventas-service',
  correlationId: '7c1d2e3f-4a5b-4c6d-8e9f-a0b1c2d3e4f5',
  data: {
    origen: 'VENTAS',
    demandaExternaId: 'PED-2026-0042',
    fechaRequerida: '2026-11-15',
    items: [
      { productoCodigo: 'GAL-001', cantidad: '40.0000', unidad: 'kg' },
      { productoCodigo: 'PAN-001', cantidad: '120', unidad: 'unidad' },
    ],
  },
};
