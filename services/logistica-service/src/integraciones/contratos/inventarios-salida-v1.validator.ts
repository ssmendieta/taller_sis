import {
  DESPACHO_RUTA_REGISTRADO_V1,
  DespachoRutaRegistradoV1Event,
  FUENTE_LOGISTICA,
  SALIDA_INVENTARIO_RESULTADO_V1,
  SalidaInventarioResultadoV1Event,
} from './inventarios-salida-v1';

export interface ErrorValidacionSalidaV1 {
  campo: string;
  motivo: string;
}

export class EventoSalidaV1InvalidoError extends Error {
  readonly codigo = 'EVENTO_SALIDA_V1_INVALIDO' as const;

  constructor(readonly eventId: string | undefined, readonly errores: ErrorValidacionSalidaV1[]) {
    super(`Evento de salida a Inventarios v1 invalido: ${errores.map(({ campo, motivo }) => `${campo}: ${motivo}`).join('; ')}`);
    this.name = 'EventoSalidaV1InvalidoError';
  }
}

type Json = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[1-9]\d{0,18}$/;
const CANTIDAD = /^(?:0|[1-9]\d{0,9})\.\d{4}$/;

const esObjeto = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown, max = 200): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function sobre(value: unknown, tipo: string, errores: ErrorValidacionSalidaV1[]): Json {
  const evento = esObjeto(value) ? value : {};
  if (!esObjeto(value)) errores.push({ campo: 'evento', motivo: 'debe ser un objeto JSON' });
  if (evento.eventType !== tipo) errores.push({ campo: 'eventType', motivo: `debe ser ${tipo}` });
  for (const campo of ['eventId', 'correlationId']) {
    if (typeof evento[campo] !== 'string' || !UUID.test(evento[campo] as string)) errores.push({ campo, motivo: 'debe ser un UUID' });
  }
  if (typeof evento.occurredAt !== 'string' || !ISO_CON_ZONA.test(evento.occurredAt) || Number.isNaN(Date.parse(evento.occurredAt))) {
    errores.push({ campo: 'occurredAt', motivo: 'debe ser ISO 8601 con zona horaria' });
  }
  if (!texto(evento.source, 80)) errores.push({ campo: 'source', motivo: 'debe ser un texto no vacio' });
  if (!esObjeto(evento.data)) errores.push({ campo: 'data', motivo: 'debe ser un objeto' });
  return esObjeto(evento.data) ? evento.data : {};
}

function fallar(value: unknown, errores: ErrorValidacionSalidaV1[]): never {
  const eventId = esObjeto(value) && typeof value.eventId === 'string' ? value.eventId : undefined;
  throw new EventoSalidaV1InvalidoError(eventId, errores);
}

/** Valida el evento que Logística publica; se usa antes de guardarlo en el outbox. */
export function validarDespachoRutaRegistradoV1(value: unknown): DespachoRutaRegistradoV1Event {
  const errores: ErrorValidacionSalidaV1[] = [];
  const data = sobre(value, DESPACHO_RUTA_REGISTRADO_V1, errores);
  if (esObjeto(value) && value.source !== FUENTE_LOGISTICA) errores.push({ campo: 'source', motivo: `debe ser ${FUENTE_LOGISTICA}` });
  if (typeof data.rutaId !== 'string' || !ID.test(data.rutaId)) errores.push({ campo: 'data.rutaId', motivo: 'debe ser un id positivo en texto' });
  if (typeof data.fechaProgramada !== 'string' || !FECHA.test(data.fechaProgramada)) errores.push({ campo: 'data.fechaProgramada', motivo: 'debe ser AAAA-MM-DD' });
  if (typeof data.despachadaEn !== 'string' || !ISO_CON_ZONA.test(data.despachadaEn)) errores.push({ campo: 'data.despachadaEn', motivo: 'debe ser ISO 8601 con zona horaria' });
  if (typeof data.despachadaPorUsuarioId !== 'string' || !ID.test(data.despachadaPorUsuarioId)) errores.push({ campo: 'data.despachadaPorUsuarioId', motivo: 'debe ser un id positivo en texto' });
  for (const campo of ['vehiculoExternoId', 'choferExternoId']) {
    if (!texto(data[campo], 80)) errores.push({ campo: `data.${campo}`, motivo: 'debe ser un texto de 1 a 80 caracteres' });
  }
  const boletas = Array.isArray(data.boletas) ? data.boletas : [];
  if (boletas.length === 0) errores.push({ campo: 'data.boletas', motivo: 'debe incluir al menos una boleta' });
  const vistas = new Set<string>();
  boletas.forEach((boleta: unknown, i: number) => {
    const campo = `data.boletas[${i}]`;
    if (!esObjeto(boleta)) return errores.push({ campo, motivo: 'debe ser un objeto' });
    if (typeof boleta.boletaId !== 'string' || !ID.test(boleta.boletaId)) errores.push({ campo: `${campo}.boletaId`, motivo: 'debe ser un id positivo en texto' });
    else if (vistas.has(boleta.boletaId)) errores.push({ campo: `${campo}.boletaId`, motivo: 'esta repetida' });
    else vistas.add(boleta.boletaId);
    if (!texto(boleta.numero, 16)) errores.push({ campo: `${campo}.numero`, motivo: 'es obligatorio' });
    if (typeof boleta.ordenId !== 'string' || !ID.test(boleta.ordenId)) errores.push({ campo: `${campo}.ordenId`, motivo: 'debe ser un id positivo en texto' });
    const items = Array.isArray(boleta.items) ? boleta.items : [];
    if (items.length === 0) errores.push({ campo: `${campo}.items`, motivo: 'debe incluir al menos un item' });
    items.forEach((item: unknown, j: number) => {
      const c = `${campo}.items[${j}]`;
      if (!esObjeto(item) || !texto(item.loteReferencia, 160)) errores.push({ campo: `${c}.loteReferencia`, motivo: 'es obligatoria' });
      if (!esObjeto(item) || typeof item.cantidad !== 'string' || !CANTIDAD.test(item.cantidad) || /^0\.0000$/.test(item.cantidad)) {
        errores.push({ campo: `${c}.cantidad`, motivo: 'debe ser un decimal positivo con 4 decimales en texto' });
      }
    });
  });
  if (errores.length) fallar(value, errores);
  return value as DespachoRutaRegistradoV1Event;
}

/** Valida la respuesta que Inventarios envía a Logística (ABC-387). */
export function validarSalidaInventarioResultadoV1(value: unknown): SalidaInventarioResultadoV1Event {
  const errores: ErrorValidacionSalidaV1[] = [];
  const data = sobre(value, SALIDA_INVENTARIO_RESULTADO_V1, errores);
  if (typeof data.rutaId !== 'string' || !ID.test(data.rutaId)) errores.push({ campo: 'data.rutaId', motivo: 'debe ser un id positivo en texto' });
  if (typeof data.requestEventId !== 'string' || !UUID.test(data.requestEventId)) errores.push({ campo: 'data.requestEventId', motivo: 'debe ser un UUID' });
  if (data.estado !== 'ACEPTADA' && data.estado !== 'RECHAZADA') errores.push({ campo: 'data.estado', motivo: 'debe ser ACEPTADA o RECHAZADA' });
  if (typeof data.procesadoAt !== 'string' || !ISO_CON_ZONA.test(data.procesadoAt)) errores.push({ campo: 'data.procesadoAt', motivo: 'debe ser ISO 8601 con zona horaria' });
  if (data.estado === 'RECHAZADA' && !texto(data.codigoRechazo, 100)) {
    errores.push({ campo: 'data.codigoRechazo', motivo: 'es obligatorio cuando la salida es RECHAZADA' });
  }
  if (data.estado === 'ACEPTADA' && data.codigoRechazo !== undefined) {
    errores.push({ campo: 'data.codigoRechazo', motivo: 'no corresponde a una salida ACEPTADA' });
  }
  if (data.detalle !== undefined && (typeof data.detalle !== 'string' || data.detalle.length > 500)) {
    errores.push({ campo: 'data.detalle', motivo: 'admite hasta 500 caracteres' });
  }
  if (errores.length) fallar(value, errores);
  return value as SalidaInventarioResultadoV1Event;
}
