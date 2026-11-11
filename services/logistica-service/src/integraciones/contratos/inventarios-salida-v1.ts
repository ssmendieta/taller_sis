// ABC-385: contrato v1 de la notificación de despacho entre Logística e Inventarios.
// Logística publica el despacho; Inventarios responde si acepta o rechaza la salida.
// Publicar no equivale a que Inventarios haya registrado el movimiento.

export interface EventoPubSubV1<T> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  source: string;
  correlationId: string;
  data: T;
}

export const DESPACHO_RUTA_REGISTRADO_V1 = 'DespachoRutaRegistrado.v1' as const;
export const SALIDA_INVENTARIO_RESULTADO_V1 = 'SalidaInventarioResultado.v1' as const;
export const FUENTE_LOGISTICA = 'logistica-service' as const;

export interface ItemSalidaV1 {
  loteReferencia: string;
  // Decimal en texto con 4 decimales para no perder precisión.
  cantidad: string;
}

export interface BoletaSalidaV1 {
  boletaId: string;
  numero: string;
  ordenId: string;
  productoCodigo: string;
  unidad: string;
  items: ItemSalidaV1[];
}

export interface DespachoRutaRegistradoV1Data {
  rutaId: string;
  fechaProgramada: string;
  despachadaEn: string;
  despachadaPorUsuarioId: string;
  vehiculoExternoId: string;
  choferExternoId: string;
  boletas: BoletaSalidaV1[];
}

export type EstadoSalidaInventario = 'ACEPTADA' | 'RECHAZADA';

export interface SalidaInventarioResultadoV1Data {
  rutaId: string;
  // eventId del DespachoRutaRegistrado.v1 al que responde.
  requestEventId: string;
  estado: EstadoSalidaInventario;
  procesadoAt: string;
  codigoRechazo?: string;
  detalle?: string;
}

export type DespachoRutaRegistradoV1Event = EventoPubSubV1<DespachoRutaRegistradoV1Data> & {
  eventType: typeof DESPACHO_RUTA_REGISTRADO_V1;
};

export type SalidaInventarioResultadoV1Event = EventoPubSubV1<SalidaInventarioResultadoV1Data> & {
  eventType: typeof SALIDA_INVENTARIO_RESULTADO_V1;
};

export const DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO: DespachoRutaRegistradoV1Event = {
  eventId: '5b0c8a1e-2f4d-4c6b-9a7e-1d2c3b4a5f60',
  eventType: DESPACHO_RUTA_REGISTRADO_V1,
  occurredAt: '2026-11-12T14:00:00.000Z',
  source: FUENTE_LOGISTICA,
  correlationId: '8f7e6d5c-4b3a-4291-8c7d-6e5f4a3b2c1d',
  data: {
    rutaId: '9',
    fechaProgramada: '2026-11-12',
    despachadaEn: '2026-11-12T14:00:00.000Z',
    despachadaPorUsuarioId: '4',
    vehiculoExternoId: 'VEH-01',
    choferExternoId: 'CHO-07',
    boletas: [{
      boletaId: '1',
      numero: 'BOL-2026-00001',
      ordenId: '2',
      productoCodigo: 'GAL-001',
      unidad: 'unidad',
      items: [{ loteReferencia: 'LOT-GAL-001', cantidad: '6.0000' }],
    }],
  },
};

export const SALIDA_INVENTARIO_RESULTADO_V1_EJEMPLO: SalidaInventarioResultadoV1Event = {
  eventId: '0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  eventType: SALIDA_INVENTARIO_RESULTADO_V1,
  occurredAt: '2026-11-12T14:00:05.000Z',
  source: 'inventarios-service',
  correlationId: DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO.correlationId,
  data: {
    rutaId: '9',
    requestEventId: DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO.eventId,
    estado: 'ACEPTADA',
    procesadoAt: '2026-11-12T14:00:05.000Z',
  },
};

export const SALIDA_INVENTARIO_RECHAZADA_V1_EJEMPLO: SalidaInventarioResultadoV1Event = {
  ...SALIDA_INVENTARIO_RESULTADO_V1_EJEMPLO,
  eventId: '1f2a3b4c-5d6e-4f70-8a9b-1c2d3e4f5a6b',
  data: {
    ...SALIDA_INVENTARIO_RESULTADO_V1_EJEMPLO.data,
    estado: 'RECHAZADA',
    codigoRechazo: 'LOTE_SIN_STOCK',
    detalle: 'El lote LOT-GAL-001 no tiene existencias suficientes',
  },
};
