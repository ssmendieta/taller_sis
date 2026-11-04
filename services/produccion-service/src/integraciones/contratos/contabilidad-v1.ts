import { PubSubEvent } from '../pubsub/pubsub.types';

export const PRODUCCION_CERRADA_V1 = 'ProduccionCerrada.v1' as const;
export const REGISTRO_CONTABLE_RESULTADO_V1 =
  'RegistroContableResultado.v1' as const;

export type EstadoRegistroContable = 'RECIBIDO' | 'RECHAZADO';

export interface ConsumoCierreV1 {
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  cantidad: string;
  unidad: string;
}

export interface ProduccionCerradaV1Data {
  cierreId: string;
  cierreVersion: number;
  resumenId: string;
  ordenId: number;
  ordenCodigo: string;
  producto: {
    productoId: number;
    codigo: string;
    nombre: string;
    unidad: string;
  };
  cantidadSolicitada: string;
  cantidadConforme: string;
  consumos: ConsumoCierreV1[];
  finalizadaAt: string;
}

export interface RegistroContableResultadoV1Data {
  cierreId: string;
  cierreVersion: number;
  ordenId: number;
  requestEventId: string;
  estado: EstadoRegistroContable;
  procesadoAt: string;
  codigoRechazo?: string;
  detalle?: string;
}

export type ProduccionCerradaV1Event = PubSubEvent<ProduccionCerradaV1Data> & {
  eventType: typeof PRODUCCION_CERRADA_V1;
};

export type RegistroContableResultadoV1Event =
  PubSubEvent<RegistroContableResultadoV1Data> & {
    eventType: typeof REGISTRO_CONTABLE_RESULTADO_V1;
  };

export const PRODUCCION_CERRADA_V1_EJEMPLO: ProduccionCerradaV1Event = {
  eventId: '7eb50b45-f4f1-47a6-9af5-1f0f98711dd8',
  eventType: PRODUCCION_CERRADA_V1,
  occurredAt: '2026-10-11T18:00:00.000Z',
  source: 'produccion-service',
  correlationId: '461f20b3-526f-48c2-82b8-713c0f709b3c',
  data: {
    cierreId: 'CIERRE-ORD-0015-V1',
    cierreVersion: 1,
    resumenId: 'RES-ORD-0015-V1',
    ordenId: 15,
    ordenCodigo: 'ORD-0015',
    producto: {
      productoId: 3,
      codigo: 'PAN-001',
      nombre: 'Pan integral',
      unidad: 'unidad',
    },
    cantidadSolicitada: '30.0000',
    cantidadConforme: '30.0000',
    consumos: [{
      materialId: '8',
      materialCodigo: 'HAR-001',
      materialNombre: 'Harina de trigo',
      cantidad: '12.5000',
      unidad: 'kg',
    }],
    finalizadaAt: '2026-10-11T17:55:00.000Z',
  },
};

// Contrato de interoperabilidad futura. Este sprint no lo consume.
export const REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO:
RegistroContableResultadoV1Event = {
  eventId: 'f03b8547-47aa-4c66-a93c-d8f6162730c7',
  eventType: REGISTRO_CONTABLE_RESULTADO_V1,
  occurredAt: '2026-10-11T18:00:03.000Z',
  source: 'contabilidad-simulator',
  correlationId: PRODUCCION_CERRADA_V1_EJEMPLO.correlationId,
  data: {
    cierreId: 'CIERRE-ORD-0015-V1',
    cierreVersion: 1,
    ordenId: 15,
    requestEventId: PRODUCCION_CERRADA_V1_EJEMPLO.eventId,
    estado: 'RECIBIDO',
    procesadoAt: '2026-10-11T18:00:03.000Z',
  },
};
