import { esUnidadValida } from '../../unidades/unidades.catalogo';
import {
  SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1,
  SOLICITUD_MATERIAL_ALMACEN_V1,
} from './inventario-almacen-v1';
import type {
  SolicitudMaterialAlmacenEstadoActualizadoV1Event,
  SolicitudMaterialAlmacenV1Event,
} from './inventario-almacen-v1';

type JsonObject = Record<string, unknown>;

export interface ErrorValidacionInventarioV1 {
  campo: string;
  motivo: string;
}

export interface DiagnosticoEventoInventarioV1 {
  codigo: 'EVENTO_INVENTARIO_V1_INVALIDO';
  eventType?: string;
  eventId?: string;
  errores: ErrorValidacionInventarioV1[];
}

export class EventoInventarioV1InvalidoError extends Error {
  readonly codigo = 'EVENTO_INVENTARIO_V1_INVALIDO' as const;

  constructor(
    readonly eventType: string | undefined,
    readonly eventId: string | undefined,
    readonly errores: ErrorValidacionInventarioV1[],
  ) {
    super(
      `Evento de Inventarios v1 invalido: ${errores
        .map(({ campo, motivo }) => `${campo}: ${motivo}`)
        .join('; ')}`,
    );
    this.name = 'EventoInventarioV1InvalidoError';
  }

  diagnostico(): DiagnosticoEventoInventarioV1 {
    return {
      codigo: this.codigo,
      eventType: this.eventType,
      eventId: this.eventId,
      errores: this.errores,
    };
  }
}

const ESTADOS_SOLICITUD = ['PENDIENTE', 'APROBADA', 'CANCELADA'] as const;
const MAX_BIGINT_POSTGRES = 9223372036854775807n;
const MAX_CANTIDAD = 9999999999.9999;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_CANTIDAD = /^(?:0\.\d{1,4}|[1-9]\d{0,9}(?:\.\d{1,4})?)$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FECHA_HORA_CON_ZONA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function esObjeto(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function leerTexto(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function agregarError(
  errores: ErrorValidacionInventarioV1[],
  campo: string,
  motivo: string,
): void {
  errores.push({ campo, motivo });
}

function validarTexto(
  value: unknown,
  campo: string,
  errores: ErrorValidacionInventarioV1[],
): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    agregarError(errores, campo, 'debe ser un texto no vacio');
    return false;
  }
  return true;
}

function validarUuid(
  value: unknown,
  campo: string,
  errores: ErrorValidacionInventarioV1[],
): value is string {
  if (!validarTexto(value, campo, errores)) return false;
  if (!UUID.test(value)) {
    agregarError(errores, campo, 'debe ser un UUID');
    return false;
  }
  return true;
}

function validarBigintPositivoComoTexto(
  value: unknown,
  campo: string,
  errores: ErrorValidacionInventarioV1[],
): value is string {
  if (!validarTexto(value, campo, errores)) return false;
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > MAX_BIGINT_POSTGRES) {
    agregarError(errores, campo, 'debe representar un BIGINT positivo');
    return false;
  }
  return true;
}

function validarEnteroSeguroPositivo(
  value: unknown,
  campo: string,
  errores: ErrorValidacionInventarioV1[],
): value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    agregarError(errores, campo, 'debe ser un entero positivo seguro');
    return false;
  }
  return true;
}

function validarFecha(
  value: unknown,
  campo: string,
  errores: ErrorValidacionInventarioV1[],
): value is string {
  if (!validarTexto(value, campo, errores)) return false;
  const match = FECHA.exec(value);
  if (!match) {
    agregarError(errores, campo, 'debe usar el formato YYYY-MM-DD');
    return false;
  }
  const [, year, month, day] = match;
  if (!esFechaCalendarioValida(year, month, day)) {
    agregarError(errores, campo, 'debe ser una fecha valida');
    return false;
  }
  return true;
}

function esFechaCalendarioValida(year: string, month: string, day: string): boolean {
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day);
}

function validarFechaHora(
  value: unknown,
  campo: string,
  errores: ErrorValidacionInventarioV1[],
): value is string {
  if (!validarTexto(value, campo, errores)) return false;
  const match = FECHA_HORA_CON_ZONA.exec(value);
  const fechaValida = match
    ? esFechaCalendarioValida(match[1], match[2], match[3])
      && Number(match[4]) <= 23
      && Number(match[5]) <= 59
      && Number(match[6]) <= 59
    : false;
  if (!fechaValida || Number.isNaN(Date.parse(value))) {
    agregarError(errores, campo, 'debe ser ISO 8601 e incluir zona horaria');
    return false;
  }
  return true;
}

function validarSobre(
  value: unknown,
  eventType: string,
  source: string,
  errores: ErrorValidacionInventarioV1[],
): value is JsonObject {
  if (!esObjeto(value)) {
    agregarError(errores, '$', 'debe ser un objeto');
    return false;
  }
  validarUuid(value.eventId, 'eventId', errores);
  validarUuid(value.correlationId, 'correlationId', errores);
  validarFechaHora(value.occurredAt, 'occurredAt', errores);
  if (value.eventType !== eventType) {
    agregarError(errores, 'eventType', `debe ser ${eventType}`);
  }
  if (value.source !== source) {
    agregarError(errores, 'source', `debe ser ${source}`);
  }
  if (!esObjeto(value.data)) {
    agregarError(errores, 'data', 'debe ser un objeto');
  }
  return true;
}

function crearError(
  value: unknown,
  errores: ErrorValidacionInventarioV1[],
): EventoInventarioV1InvalidoError {
  const event = esObjeto(value) ? value : {};
  return new EventoInventarioV1InvalidoError(
    leerTexto(event.eventType),
    leerTexto(event.eventId),
    errores,
  );
}

function esEstadoSolicitud(value: unknown): boolean {
  return typeof value === 'string'
    && (ESTADOS_SOLICITUD as readonly string[]).includes(value);
}

export function esTipoEventoSolicitudMaterialInventarioV1(
  eventType: unknown,
): boolean {
  if (typeof eventType !== 'string') return false;
  return eventType.startsWith('SolicitudMaterialAlmacen.v')
    || eventType.startsWith('SolicitudMaterialAlmacenEstadoActualizado.v');
}

export function validarSolicitudMaterialAlmacenV1(
  value: unknown,
): SolicitudMaterialAlmacenV1Event {
  const errores: ErrorValidacionInventarioV1[] = [];
  const tieneSobre = validarSobre(
    value,
    SOLICITUD_MATERIAL_ALMACEN_V1,
    'produccion-service',
    errores,
  );

  if (tieneSobre && esObjeto(value.data)) {
    const data = value.data;
    validarBigintPositivoComoTexto(data.solicitudId, 'data.solicitudId', errores);
    validarEnteroSeguroPositivo(data.solicitudVersion, 'data.solicitudVersion', errores);
    validarEnteroSeguroPositivo(data.ordenId, 'data.ordenId', errores);
    validarTexto(data.ordenCodigo, 'data.ordenCodigo', errores);
    validarBigintPositivoComoTexto(
      data.solicitanteUsuarioId,
      'data.solicitanteUsuarioId',
      errores,
    );
    validarFecha(data.fechaNecesaria, 'data.fechaNecesaria', errores);

    if (!Array.isArray(data.items) || data.items.length === 0) {
      agregarError(errores, 'data.items', 'debe contener al menos un item');
    } else {
      const materiales = new Set<string>();
      data.items.forEach((item, index) => {
        const campo = `data.items[${index}]`;
        if (!esObjeto(item)) {
          agregarError(errores, campo, 'debe ser un objeto');
          return;
        }
        if (validarBigintPositivoComoTexto(item.materialId, `${campo}.materialId`, errores)) {
          if (materiales.has(item.materialId)) {
            agregarError(errores, `${campo}.materialId`, 'no debe repetirse');
          }
          materiales.add(item.materialId);
        }
        validarTexto(item.materialCodigo, `${campo}.materialCodigo`, errores);
        validarTexto(item.materialNombre, `${campo}.materialNombre`, errores);
        if (!validarTexto(item.cantidad, `${campo}.cantidad`, errores)
          || !DECIMAL_CANTIDAD.test(item.cantidad)
          || Number(item.cantidad) < 0.0001
          || Number(item.cantidad) > MAX_CANTIDAD) {
          if (typeof item.cantidad === 'string' && item.cantidad.trim()) {
            agregarError(
              errores,
              `${campo}.cantidad`,
              'debe ser un decimal positivo con hasta cuatro decimales',
            );
          }
        }
        if (!esUnidadValida(item.unidad)) {
          agregarError(errores, `${campo}.unidad`, 'debe pertenecer al catalogo de unidades');
        }
      });
    }
  }

  if (errores.length > 0) throw crearError(value, errores);
  return value as SolicitudMaterialAlmacenV1Event;
}

export function validarSolicitudMaterialAlmacenEstadoActualizadoV1(
  value: unknown,
): SolicitudMaterialAlmacenEstadoActualizadoV1Event {
  const errores: ErrorValidacionInventarioV1[] = [];
  const tieneSobre = validarSobre(
    value,
    SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1,
    'almacen-service',
    errores,
  );

  if (tieneSobre && esObjeto(value.data)) {
    const data = value.data;
    validarBigintPositivoComoTexto(data.solicitudId, 'data.solicitudId', errores);
    validarEnteroSeguroPositivo(data.solicitudVersion, 'data.solicitudVersion', errores);
    validarUuid(data.requestEventId, 'data.requestEventId', errores);
    validarEnteroSeguroPositivo(data.ordenId, 'data.ordenId', errores);
    if (!esEstadoSolicitud(data.estadoAnterior)) {
      agregarError(errores, 'data.estadoAnterior', 'debe ser PENDIENTE, APROBADA o CANCELADA');
    }
    if (!esEstadoSolicitud(data.estadoNuevo)) {
      agregarError(errores, 'data.estadoNuevo', 'debe ser PENDIENTE, APROBADA o CANCELADA');
    }
    validarFechaHora(data.actualizadoAt, 'data.actualizadoAt', errores);
    if (data.motivo !== undefined) {
      validarTexto(data.motivo, 'data.motivo', errores);
    }
  }

  if (errores.length > 0) throw crearError(value, errores);
  return value as SolicitudMaterialAlmacenEstadoActualizadoV1Event;
}

export function validarEventoSolicitudMaterialInventarioV1(
  value: unknown,
): SolicitudMaterialAlmacenV1Event | SolicitudMaterialAlmacenEstadoActualizadoV1Event {
  if (!esObjeto(value)) {
    throw crearError(value, [{ campo: '$', motivo: 'debe ser un objeto' }]);
  }
  if (value.eventType === SOLICITUD_MATERIAL_ALMACEN_V1) {
    return validarSolicitudMaterialAlmacenV1(value);
  }
  if (value.eventType === SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1) {
    return validarSolicitudMaterialAlmacenEstadoActualizadoV1(value);
  }
  throw crearError(value, [{
    campo: 'eventType',
    motivo: `debe ser ${SOLICITUD_MATERIAL_ALMACEN_V1} o ${SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1}`,
  }]);
}

export function validarCorrelacionSolicitudMaterialInventarioV1(
  solicitudValue: unknown,
  respuestaValue: unknown,
): void {
  const solicitud = validarSolicitudMaterialAlmacenV1(solicitudValue);
  const respuesta = validarSolicitudMaterialAlmacenEstadoActualizadoV1(respuestaValue);
  const errores: ErrorValidacionInventarioV1[] = [];

  if (respuesta.correlationId !== solicitud.correlationId) {
    agregarError(errores, 'correlationId', 'no coincide con la solicitud original');
  }
  if (respuesta.data.requestEventId !== solicitud.eventId) {
    agregarError(errores, 'data.requestEventId', 'no coincide con el eventId solicitado');
  }
  if (respuesta.data.solicitudId !== solicitud.data.solicitudId) {
    agregarError(errores, 'data.solicitudId', 'no coincide con la solicitud original');
  }
  if (respuesta.data.ordenId !== solicitud.data.ordenId) {
    agregarError(errores, 'data.ordenId', 'no coincide con la orden original');
  }
  if (respuesta.data.solicitudVersion <= solicitud.data.solicitudVersion) {
    agregarError(errores, 'data.solicitudVersion', 'debe avanzar la version de la solicitud');
  }

  if (errores.length > 0) throw crearError(respuesta, errores);
}
