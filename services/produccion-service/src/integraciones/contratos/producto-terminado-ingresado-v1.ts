import type { PubSubEvent } from '../pubsub/pubsub.types';

export const PRODUCTO_TERMINADO_INGRESADO_V1 =
  'ProductoTerminadoIngresado.v1' as const;

export interface ProductoTerminadoIngresadoV1Data {
  loteId: string;
  loteCodigo: string;
  ordenId: number;
  ordenCodigo: string;
  productoId: string;
  cantidadConforme: string;
  fechaIngreso: string;
}

export type ProductoTerminadoIngresadoV1Event =
  PubSubEvent<ProductoTerminadoIngresadoV1Data> & {
    eventType: typeof PRODUCTO_TERMINADO_INGRESADO_V1;
  };

export const PRODUCTO_TERMINADO_INGRESADO_V1_EJEMPLO:
ProductoTerminadoIngresadoV1Event = {
  eventId: '3b1f6c1e-6f0a-4c52-9d5e-2a7f3c9b8e41',
  eventType: PRODUCTO_TERMINADO_INGRESADO_V1,
  occurredAt: '2026-11-20T15:30:00.000Z',
  source: 'produccion-service',
  correlationId: 'c4a8d2f7-1b63-4e9a-8f05-7d2e6b9a1c33',
  data: {
    loteId: '4',
    loteCodigo: 'L-0004',
    ordenId: 15,
    ordenCodigo: 'ORD-0015',
    productoId: '3',
    cantidadConforme: '10.0000',
    fechaIngreso: '2026-11-20T15:29:58.000Z',
  },
};
