import {
  PRODUCCION_CERRADA_V1,
  ProduccionCerradaV1Event,
  REGISTRO_CONTABLE_RESULTADO_V1,
  RegistroContableResultadoV1Event,
} from './contabilidad-v1';

type JsonObject = Record<string, unknown>;

export interface ErrorValidacionContabilidadV1 {
  campo: string;
  motivo: string;
}

export class EventoContabilidadV1InvalidoError extends Error {
  readonly codigo = 'EVENTO_CONTABILIDAD_V1_INVALIDO' as const;

  constructor(
    readonly eventType: string | undefined,
    readonly eventId: string | undefined,
    readonly errores: ErrorValidacionContabilidadV1[],
  ) {
    super(`Evento de Contabilidad v1 invalido: ${errores
      .map(({ campo, motivo }) => `${campo}: ${motivo}`)
      .join('; ')}`);
    this.name = 'EventoContabilidadV1InvalidoError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA_HORA_CON_ZONA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function esObjeto(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function texto(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function error(value: unknown, errores: ErrorValidacionContabilidadV1[]) {
  const evento = esObjeto(value) ? value : {};
  return new EventoContabilidadV1InvalidoError(
    texto(evento.eventType),
    texto(evento.eventId),
    errores,
  );
}

function validarTexto(value: unknown, campo: string, errores: ErrorValidacionContabilidadV1[]): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    errores.push({ campo, motivo: 'debe ser un texto no vacio' });
    return false;
  }
  return true;
}

function validarUuid(value: unknown, campo: string, errores: ErrorValidacionContabilidadV1[]): value is string {
  if (!validarTexto(value, campo, errores)) return false;
  if (!UUID.test(value)) {
    errores.push({ campo, motivo: 'debe ser un UUID' });
    return false;
  }
  return true;
}

function validarFechaHora(value: unknown, campo: string, errores: ErrorValidacionContabilidadV1[]): value is string {
  if (!validarTexto(value, campo, errores)) return false;
  const match = FECHA_HORA_CON_ZONA.exec(value);
  if (!match || Number(match[2]) > 12 || Number(match[4]) > 23
    || Number(match[5]) > 59 || Number(match[6]) > 59 || Number.isNaN(Date.parse(value))) {
    errores.push({ campo, motivo: 'debe ser ISO 8601 e incluir zona horaria' });
    return false;
  }
  return true;
}

function validarEnteroPositivo(value: unknown, campo: string, errores: ErrorValidacionContabilidadV1[]): value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    errores.push({ campo, motivo: 'debe ser un entero positivo seguro' });
    return false;
  }
  return true;
}

function validarBigintPositivo(value: unknown, campo: string, errores: ErrorValidacionContabilidadV1[]): value is string {
  if (!validarTexto(value, campo, errores)) return false;
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > 9223372036854775807n) {
    errores.push({ campo, motivo: 'debe representar un BIGINT positivo' });
    return false;
  }
  return true;
}

export function validarRegistroContableResultadoV1(value: unknown): RegistroContableResultadoV1Event {
  const errores: ErrorValidacionContabilidadV1[] = [];
  if (!esObjeto(value)) throw error(value, [{ campo: '$', motivo: 'debe ser un objeto' }]);

  validarUuid(value.eventId, 'eventId', errores);
  validarUuid(value.correlationId, 'correlationId', errores);
  validarFechaHora(value.occurredAt, 'occurredAt', errores);
  validarTexto(value.source, 'source', errores);
  if (value.eventType !== REGISTRO_CONTABLE_RESULTADO_V1) {
    errores.push({ campo: 'eventType', motivo: `debe ser ${REGISTRO_CONTABLE_RESULTADO_V1}` });
  }
  if (!esObjeto(value.data)) {
    errores.push({ campo: 'data', motivo: 'debe ser un objeto' });
  } else {
    validarTexto(value.data.cierreId, 'data.cierreId', errores);
    validarEnteroPositivo(value.data.cierreVersion, 'data.cierreVersion', errores);
    validarEnteroPositivo(value.data.ordenId, 'data.ordenId', errores);
    validarUuid(value.data.requestEventId, 'data.requestEventId', errores);
    validarFechaHora(value.data.procesadoAt, 'data.procesadoAt', errores);
    if (value.data.estado !== 'RECIBIDO' && value.data.estado !== 'RECHAZADO') {
      errores.push({ campo: 'data.estado', motivo: 'debe ser RECIBIDO o RECHAZADO' });
    }
    if (value.data.estado === 'RECHAZADO') {
      if (validarTexto(value.data.codigoRechazo, 'data.codigoRechazo', errores) &&
          [...value.data.codigoRechazo.trim()].length > 100) {
        errores.push({ campo: 'data.codigoRechazo', motivo: 'admite hasta 100 caracteres' });
      }
    } else if (value.data.codigoRechazo !== undefined) {
      errores.push({ campo: 'data.codigoRechazo', motivo: 'solo corresponde a RECHAZADO' });
    }
    if (value.data.detalle !== undefined &&
        validarTexto(value.data.detalle, 'data.detalle', errores) &&
        [...value.data.detalle.trim()].length > 500) {
      errores.push({ campo: 'data.detalle', motivo: 'admite hasta 500 caracteres' });
    }
  }

  if (errores.length) throw error(value, errores);
  return value as unknown as RegistroContableResultadoV1Event;
}

const MONTO = /^\d+\.\d{4}$/;

// ABC-345: valida solo la ampliacion de costos. Los eventos anteriores, sin
// costoBase ni campos de costo en los consumos, siguen siendo validos.
export function validarCostoBaseProduccionCerradaV1(value: unknown): ProduccionCerradaV1Event {
  const errores: ErrorValidacionContabilidadV1[] = [];
  if (!esObjeto(value) || value.eventType !== PRODUCCION_CERRADA_V1 || !esObjeto(value.data)) {
    throw error(value, [{ campo: '$', motivo: 'debe ser un ProduccionCerrada.v1' }]);
  }
  const data = value.data;
  const consumos = Array.isArray(data.consumos) ? data.consumos : [];
  let calculados = 0;
  consumos.forEach((consumo, i) => {
    if (!esObjeto(consumo)) return;
    const campo = `data.consumos[${i}]`;
    if (consumo.estadoCosto === undefined) {
      for (const k of ['costoUnitario', 'costoTotal']) {
        if (consumo[k] !== undefined) errores.push({ campo: `${campo}.${k}`, motivo: 'requiere estadoCosto' });
      }
    } else if (consumo.estadoCosto === 'CALCULADO') {
      calculados += 1;
      for (const k of ['costoUnitario', 'costoTotal']) {
        if (typeof consumo[k] !== 'string' || !MONTO.test(consumo[k] as string)) {
          errores.push({ campo: `${campo}.${k}`, motivo: 'debe ser decimal con 4 posiciones' });
        }
      }
    } else if (consumo.estadoCosto === 'PENDIENTE') {
      for (const k of ['costoUnitario', 'costoTotal']) {
        if (consumo[k] !== undefined) errores.push({ campo: `${campo}.${k}`, motivo: 'no se informa importe si esta PENDIENTE' });
      }
    } else {
      errores.push({ campo: `${campo}.estadoCosto`, motivo: 'debe ser CALCULADO o PENDIENTE' });
    }
  });
  if (data.costoBase !== undefined) {
    const base = data.costoBase;
    if (!esObjeto(base)) {
      errores.push({ campo: 'data.costoBase', motivo: 'debe ser un objeto' });
    } else {
      if (base.moneda !== 'BOB') errores.push({ campo: 'data.costoBase.moneda', motivo: 'debe ser BOB' });
      if (base.fuentePrecios !== 'CATALOGO_MATERIALES') {
        errores.push({ campo: 'data.costoBase.fuentePrecios', motivo: 'debe ser CATALOGO_MATERIALES' });
      }
      if (base.estado !== 'COMPLETO' && base.estado !== 'PARCIAL' && base.estado !== 'PENDIENTE') {
        errores.push({ campo: 'data.costoBase.estado', motivo: 'debe ser COMPLETO, PARCIAL o PENDIENTE' });
      } else if (base.estado === 'COMPLETO') {
        if (typeof base.total !== 'string' || !MONTO.test(base.total)) {
          errores.push({ campo: 'data.costoBase.total', motivo: 'COMPLETO requiere total decimal con 4 posiciones' });
        }
        if (calculados !== consumos.length) {
          errores.push({ campo: 'data.costoBase.estado', motivo: 'COMPLETO exige todos los consumos CALCULADOS' });
        }
      } else if (base.total !== undefined) {
        errores.push({ campo: 'data.costoBase.total', motivo: 'solo se informa con estado COMPLETO' });
      }
    }
  }
  if (errores.length) throw error(value, errores);
  return value as unknown as ProduccionCerradaV1Event;
}

export function validarCorrelacionRegistroContableV1(
  solicitudValue: unknown,
  respuestaValue: unknown,
): void {
  const respuesta = validarRegistroContableResultadoV1(respuestaValue);
  const errores: ErrorValidacionContabilidadV1[] = [];
  if (!esObjeto(solicitudValue) || solicitudValue.eventType !== PRODUCCION_CERRADA_V1 || !esObjeto(solicitudValue.data)) {
    throw error(respuesta, [{ campo: 'data.requestEventId', motivo: 'no refiere un ProduccionCerrada.v1 valido' }]);
  }
  const solicitud = solicitudValue as unknown as ProduccionCerradaV1Event;
  if (respuesta.data.requestEventId !== solicitud.eventId) errores.push({ campo: 'data.requestEventId', motivo: 'no coincide con el evento original' });
  if (respuesta.correlationId !== solicitud.correlationId) errores.push({ campo: 'correlationId', motivo: 'no coincide con el evento original' });
  if (respuesta.data.cierreId !== solicitud.data.cierreId) errores.push({ campo: 'data.cierreId', motivo: 'no coincide con el cierre original' });
  if (respuesta.data.cierreVersion !== solicitud.data.cierreVersion) errores.push({ campo: 'data.cierreVersion', motivo: 'no coincide con el cierre original' });
  if (respuesta.data.ordenId !== solicitud.data.ordenId) errores.push({ campo: 'data.ordenId', motivo: 'no coincide con la orden original' });
  if (errores.length) throw error(respuesta, errores);
}
