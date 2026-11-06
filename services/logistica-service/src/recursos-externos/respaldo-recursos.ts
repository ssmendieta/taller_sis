import { RespuestaRecursosErpV1 } from './dto/recursos-logisticos-v1';

// ABC-353 ↔ ABC-352: interfaz de la copia de respaldo acordada en el contrato v1
// (docs/integraciones/recursos-logisticos-v1.md, "Copia de respaldo"). ABC-352
// la implementa con persistencia; mientras no exista, no hay copia y un fallo
// del ERP se informa como indisponibilidad.
export const RESPALDO_RECURSOS_LOGISTICOS = Symbol('RESPALDO_RECURSOS_LOGISTICOS');

export interface CopiaRecursosLogisticos {
  respuesta: RespuestaRecursosErpV1;
  // Fecha y hora ISO 8601 en que Logística obtuvo la respuesta del ERP.
  sincronizadoEn: string;
}

export interface RespaldoRecursosLogisticos {
  // Última copia válida de la fecha, o null si no existe.
  obtener(fecha: string): Promise<CopiaRecursosLogisticos | null>;
  // Reemplaza completa la copia de la fecha con una respuesta 200 ya validada.
  reemplazar(copia: CopiaRecursosLogisticos): Promise<void>;
}

export const SIN_RESPALDO_RECURSOS: RespaldoRecursosLogisticos = {
  obtener: async () => null,
  reemplazar: async () => undefined,
};
