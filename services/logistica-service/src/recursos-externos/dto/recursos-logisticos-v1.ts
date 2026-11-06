// ABC-115 / ABC-350: contrato v1 de consulta de vehículos y choferes al ERP.
// Documentado en docs/integraciones/recursos-logisticos-v1.md. Consultar no
// reserva recursos en el ERP; la asignación interna es de ABC-368.

export const RECURSOS_LOGISTICOS_V1 = 'recursos-logisticos.v1' as const;
export const RUTA_ERP_RECURSOS_V1 = '/v1/recursos-logisticos';
export const TIMEOUT_ERP_RECURSOS_MS = 3000;

// Igual que rutas.vehiculo_externo_id y rutas.chofer_externo_id (VARCHAR(80)).
export const MAX_ID_EXTERNO = 80;
export const MAX_PLACA = 20;
export const MAX_DESCRIPCION_VEHICULO = 120;
export const MAX_NOMBRE_CHOFER = 150;
export const MAX_LICENCIA_CATEGORIA = 10;
export const MAX_CAPACIDAD = '9999999999.9999';

// Unidades admitidas para la capacidad; no se convierten entre sí.
export const UNIDADES_CAPACIDAD_V1 = ['kg', 'l', 'm3', 'unidad', 'caja', 'paquete'] as const;
export type UnidadCapacidadV1 = (typeof UNIDADES_CAPACIDAD_V1)[number];

export interface CapacidadV1 {
  valor: string;
  unidad: UnidadCapacidadV1;
}

export interface VehiculoErpV1 {
  idExterno: string;
  placa: string;
  descripcion: string | null;
  capacidad: CapacidadV1;
  disponible: boolean;
}

export interface ChoferErpV1 {
  idExterno: string;
  nombre: string;
  licenciaCategoria: string | null;
  disponible: boolean;
}

export interface RespuestaRecursosErpV1 {
  version: typeof RECURSOS_LOGISTICOS_V1;
  fecha: string;
  generadoEn: string;
  vehiculos: VehiculoErpV1[];
  choferes: ChoferErpV1[];
}

// Fallos de la consulta al ERP. Ninguno reemplaza la última copia válida: se
// muestra esa copia como respaldo o, si no existe, se informa indisponibilidad.
export const MOTIVOS_FALLO_ERP_RECURSOS = [
  'TIMEOUT',
  'NO_DISPONIBLE',
  'CREDENCIALES',
  'SOLICITUD_RECHAZADA',
  'RESPUESTA_INVALIDA',
] as const;
export type MotivoFalloErpRecursos = (typeof MOTIVOS_FALLO_ERP_RECURSOS)[number];

export class ErpRecursosNoDisponibleError extends Error {
  constructor(
    readonly motivo: MotivoFalloErpRecursos,
    readonly detalle?: string,
  ) {
    super(`Recursos del ERP no disponibles (${motivo})${detalle ? `: ${detalle}` : ''}`);
    this.name = 'ErpRecursosNoDisponibleError';
  }
}

// Clasifica la respuesta HTTP del ERP según la tabla de errores del contrato.
export function motivoPorEstadoHttp(status: number): MotivoFalloErpRecursos | null {
  if (status === 200) return null;
  if (status === 401 || status === 403) return 'CREDENCIALES';
  if (status >= 400 && status < 500) return 'SOLICITUD_RECHAZADA';
  return 'NO_DISPONIBLE';
}

export const EJEMPLO_RESPUESTA_RECURSOS_V1: RespuestaRecursosErpV1 = {
  version: RECURSOS_LOGISTICOS_V1,
  fecha: '2026-11-10',
  generadoEn: '2026-11-09T21:00:00.000Z',
  vehiculos: [
    {
      idExterno: 'VEH-01',
      placa: '2345-ABC',
      descripcion: 'Camión furgón',
      capacidad: { valor: '1500.0000', unidad: 'kg' },
      disponible: true,
    },
    {
      idExterno: 'VEH-02',
      placa: '3456-BCD',
      descripcion: null,
      capacidad: { valor: '800.0000', unidad: 'kg' },
      disponible: false,
    },
  ],
  choferes: [
    { idExterno: 'CHO-12', nombre: 'Juan Pérez', licenciaCategoria: 'C', disponible: true },
    { idExterno: 'CHO-07', nombre: 'Ana Rojas', licenciaCategoria: null, disponible: false },
  ],
};
