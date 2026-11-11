import { EntityManager } from 'typeorm';

// ABC-376 ↔ ABC-384/ABC-386: punto donde el despacho deja su evento de salida.
// Se llama dentro de la transacción del despacho, antes del commit: ABC-386 lo
// implementa guardando el evento en el outbox con ese mismo `manager` y nunca
// publica a Pub/Sub desde aquí. Si falla, el despacho completo se revierte.
export const EVENTOS_DESPACHO = Symbol('EVENTOS_DESPACHO');

export interface DespachoRegistrado {
  rutaId: string;
  fechaProgramada: string;
  vehiculoExternoId: string;
  choferExternoId: string;
  despachadaEn: Date;
  despachadaPorUsuarioId: string;
  boletaIds: string[];
}

export interface EventosDespacho {
  registrarDespacho(manager: EntityManager, despacho: DespachoRegistrado): Promise<void>;
}

// Implementación nula para pruebas unitarias del despacho; en ejecución se usa
// OutboxEventosDespacho (ABC-386).
export const SIN_EVENTOS_DESPACHO: EventosDespacho = {
  registrarDespacho: async () => undefined,
};
