import type { PubSubEvent } from '../pubsub/pubsub.types';

export const DISPONIBILIDAD_MATERIAL_SOLICITADA_V1 =
  'DisponibilidadMaterialSolicitada.v1' as const;
export const DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1 =
  'DisponibilidadMaterialRespondida.v1' as const;
export const SOLICITUD_MATERIAL_ALMACEN_V1 =
  'SolicitudMaterialAlmacen.v1' as const;
export const SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1 =
  'SolicitudMaterialAlmacenEstadoActualizado.v1' as const;

export type EstadoDisponibilidadMaterial =
  | 'SUFICIENTE'
  | 'INSUFICIENTE'
  | 'FALTANTE';

export type EstadoSolicitudMaterialAlmacen =
  | 'PENDIENTE'
  | 'APROBADA'
  | 'CANCELADA';

export interface MaterialRequeridoV1 {
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  cantidadRequerida: string;
  unidad: string;
}

export interface DisponibilidadMaterialSolicitadaV1Data {
  consultaId: string;
  consultaVersion: number;
  ordenId: number;
  ordenCodigo: string;
  fechaNecesaria: string;
  materiales: MaterialRequeridoV1[];
}

export interface DisponibilidadMaterialRespondidaV1Data {
  consultaId: string;
  consultaVersion: number;
  requestEventId: string;
  ordenId: number;
  vigenteAt: string;
  materiales: Array<MaterialRequeridoV1 & {
    cantidadDisponible: string;
    estado: EstadoDisponibilidadMaterial;
  }>;
}

export interface SolicitudMaterialAlmacenV1Data {
  solicitudId: string;
  solicitudVersion: number;
  ordenId: number;
  ordenCodigo: string;
  solicitanteUsuarioId: string;
  fechaNecesaria: string;
  items: Array<{
    materialId: string;
    materialCodigo: string;
    materialNombre: string;
    cantidad: string;
    unidad: string;
  }>;
}

export interface SolicitudMaterialAlmacenEstadoActualizadoV1Data {
  solicitudId: string;
  solicitudVersion: number;
  requestEventId: string;
  ordenId: number;
  estadoAnterior: EstadoSolicitudMaterialAlmacen;
  estadoNuevo: EstadoSolicitudMaterialAlmacen;
  actualizadoAt: string;
  motivo?: string;
}

export type DisponibilidadMaterialSolicitadaV1Event =
  PubSubEvent<DisponibilidadMaterialSolicitadaV1Data> & {
    eventType: typeof DISPONIBILIDAD_MATERIAL_SOLICITADA_V1;
  };

export type DisponibilidadMaterialRespondidaV1Event =
  PubSubEvent<DisponibilidadMaterialRespondidaV1Data> & {
    eventType: typeof DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1;
  };

export type SolicitudMaterialAlmacenV1Event =
  PubSubEvent<SolicitudMaterialAlmacenV1Data> & {
    eventType: typeof SOLICITUD_MATERIAL_ALMACEN_V1;
  };

export type SolicitudMaterialAlmacenEstadoActualizadoV1Event =
  PubSubEvent<SolicitudMaterialAlmacenEstadoActualizadoV1Data> & {
    eventType: typeof SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1;
  };

export const DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO:
DisponibilidadMaterialSolicitadaV1Event = {
  eventId: 'd59541e7-d44c-4138-92e1-3432310cd1aa',
  eventType: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1,
  occurredAt: '2026-10-11T18:10:00.000Z',
  source: 'produccion-service',
  correlationId: '67bfbe4d-9a02-4cb9-b707-d68434ba2c4a',
  data: {
    consultaId: 'DISP-ORD-0015-V1',
    consultaVersion: 1,
    ordenId: 15,
    ordenCodigo: 'ORD-0015',
    fechaNecesaria: '2026-10-13',
    materiales: [{
      materialId: '8',
      materialCodigo: 'HAR-001',
      materialNombre: 'Harina de trigo',
      cantidadRequerida: '12.5000',
      unidad: 'kg',
    }],
  },
};

// Contrato de interoperabilidad futura. Este sprint no lo consume.
export const DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1_EJEMPLO:
DisponibilidadMaterialRespondidaV1Event = {
  eventId: 'fa7c5d18-9fb9-44c0-b59c-bf4452495647',
  eventType: DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1,
  occurredAt: '2026-10-11T18:10:03.000Z',
  source: 'inventario-service',
  correlationId: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO.correlationId,
  data: {
    consultaId: 'DISP-ORD-0015-V1',
    consultaVersion: 1,
    requestEventId: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO.eventId,
    ordenId: 15,
    vigenteAt: '2026-10-11T18:10:03.000Z',
    materiales: [{
      ...DISPONIBILIDAD_MATERIAL_SOLICITADA_V1_EJEMPLO.data.materiales[0],
      cantidadDisponible: '20.0000',
      estado: 'SUFICIENTE',
    }],
  },
};

export const SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO:
SolicitudMaterialAlmacenV1Event = {
  eventId: 'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6',
  eventType: SOLICITUD_MATERIAL_ALMACEN_V1,
  occurredAt: '2026-10-11T18:15:00.000Z',
  source: 'produccion-service',
  correlationId: '81a265f2-15ec-430c-98e5-e1fa08bb7412',
  data: {
    solicitudId: '27',
    solicitudVersion: 1,
    ordenId: 15,
    ordenCodigo: 'ORD-0015',
    solicitanteUsuarioId: '42',
    fechaNecesaria: '2026-10-13',
    items: [{
      materialId: '8',
      materialCodigo: 'HAR-001',
      materialNombre: 'Harina de trigo',
      cantidad: '12.5000',
      unidad: 'kg',
    }],
  },
};

// Evento de respuesta consumido de forma idempotente por el inbox de Produccion.
export const SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO:
SolicitudMaterialAlmacenEstadoActualizadoV1Event = {
  eventId: '9d08a84e-1f44-40b0-87be-e161d399371d',
  eventType: SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1,
  occurredAt: '2026-10-11T18:15:05.000Z',
  source: 'almacen-service',
  correlationId: SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO.correlationId,
  data: {
    solicitudId: '27',
    solicitudVersion: 2,
    requestEventId: SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO.eventId,
    ordenId: 15,
    estadoAnterior: 'PENDIENTE',
    estadoNuevo: 'APROBADA',
    actualizadoAt: '2026-10-11T18:15:05.000Z',
  },
};
