import { PRODUCTO_TERMINADO_INGRESADO_V1 } from './producto-terminado-ingresado-v1';
import type { ProductoTerminadoIngresadoV1Event } from './producto-terminado-ingresado-v1';

type JsonObject = Record<string, unknown>;

export interface ErrorValidacionProductoTerminadoV1 {
  campo: string;
  motivo: string;
}

export class ProductoTerminadoIngresadoV1InvalidoError extends Error {
  readonly codigo = 'PRODUCTO_TERMINADO_INGRESADO_V1_INVALIDO' as const;

  constructor(
    readonly eventType: string | undefined,
    readonly eventId: string | undefined,
    readonly errores: ErrorValidacionProductoTerminadoV1[],
  ) {
    super(
      `ProductoTerminadoIngresado v1 invalido: ${errores
        .map(({ campo, motivo }) => `${campo}: ${motivo}`)
        .join('; ')}`,
    );
    this.name = 'ProductoTerminadoIngresadoV1InvalidoError';
  }
}

const MAX_BIGINT_POSTGRES = 9223372036854775807n;
const MAX_CANTIDAD = 9999999999.9999;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_CANTIDAD = /^(?:0\.\d{1,4}|[1-9]\d{0,9}(?:\.\d{1,4})?)$/;
const FECHA_HORA_CON_ZONA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function esObjeto(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validarTexto(
  value: unknown,
  campo: string,
  errores: ErrorValidacionProductoTerminadoV1[],
): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    errores.push({ campo, motivo: 'debe ser un texto no vacio' });
    return false;
  }
  return true;
}

function validarUuid(
  value: unknown,
  campo: string,
  errores: ErrorValidacionProductoTerminadoV1[],
): void {
  if (validarTexto(value, campo, errores) && !UUID.test(value)) {
    errores.push({ campo, motivo: 'debe ser un UUID' });
  }
}

function validarBigintPositivoComoTexto(
  value: unknown,
  campo: string,
  errores: ErrorValidacionProductoTerminadoV1[],
): void {
  if (!validarTexto(value, campo, errores)) return;
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > MAX_BIGINT_POSTGRES) {
    errores.push({ campo, motivo: 'debe representar un BIGINT positivo' });
  }
}

function validarEnteroSeguroPositivo(
  value: unknown,
  campo: string,
  errores: ErrorValidacionProductoTerminadoV1[],
): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    errores.push({ campo, motivo: 'debe ser un entero positivo seguro' });
  }
}

function validarCantidadPositiva(
  value: unknown,
  campo: string,
  errores: ErrorValidacionProductoTerminadoV1[],
): void {
  if (!validarTexto(value, campo, errores)) return;
  if (!DECIMAL_CANTIDAD.test(value)
    || Number(value) < 0.0001
    || Number(value) > MAX_CANTIDAD) {
    errores.push({
      campo,
      motivo: 'debe ser un decimal positivo con hasta cuatro decimales',
    });
  }
}

function validarFechaHora(
  value: unknown,
  campo: string,
  errores: ErrorValidacionProductoTerminadoV1[],
): void {
  if (!validarTexto(value, campo, errores)) return;
  const match = FECHA_HORA_CON_ZONA.exec(value);
  let valida = false;
  if (match) {
    const [, y, mo, d, h, mi, s] = match;
    const fecha = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    valida = fecha.getUTCFullYear() === Number(y)
      && fecha.getUTCMonth() === Number(mo) - 1
      && fecha.getUTCDate() === Number(d)
      && Number(h) <= 23 && Number(mi) <= 59 && Number(s) <= 59
      && !Number.isNaN(Date.parse(value));
  }
  if (!valida) {
    errores.push({ campo, motivo: 'debe ser ISO 8601 e incluir zona horaria' });
  }
}

export function validarProductoTerminadoIngresadoV1(
  value: unknown,
): ProductoTerminadoIngresadoV1Event {
  const errores: ErrorValidacionProductoTerminadoV1[] = [];

  if (!esObjeto(value)) {
    throw new ProductoTerminadoIngresadoV1InvalidoError(undefined, undefined, [
      { campo: '$', motivo: 'debe ser un objeto' },
    ]);
  }

  validarUuid(value.eventId, 'eventId', errores);
  validarUuid(value.correlationId, 'correlationId', errores);
  validarFechaHora(value.occurredAt, 'occurredAt', errores);
  if (value.eventType !== PRODUCTO_TERMINADO_INGRESADO_V1) {
    errores.push({
      campo: 'eventType',
      motivo: `debe ser ${PRODUCTO_TERMINADO_INGRESADO_V1}`,
    });
  }
  if (value.source !== 'produccion-service') {
    errores.push({ campo: 'source', motivo: 'debe ser produccion-service' });
  }

  if (!esObjeto(value.data)) {
    errores.push({ campo: 'data', motivo: 'debe ser un objeto' });
  } else {
    const data = value.data;
    validarBigintPositivoComoTexto(data.loteId, 'data.loteId', errores);
    validarTexto(data.loteCodigo, 'data.loteCodigo', errores);
    validarEnteroSeguroPositivo(data.ordenId, 'data.ordenId', errores);
    validarTexto(data.ordenCodigo, 'data.ordenCodigo', errores);
    validarBigintPositivoComoTexto(data.productoId, 'data.productoId', errores);
    validarCantidadPositiva(data.cantidadConforme, 'data.cantidadConforme', errores);
    validarFechaHora(data.fechaIngreso, 'data.fechaIngreso', errores);
  }

  if (errores.length > 0) {
    throw new ProductoTerminadoIngresadoV1InvalidoError(
      typeof value.eventType === 'string' ? value.eventType : undefined,
      typeof value.eventId === 'string' ? value.eventId : undefined,
      errores,
    );
  }
  return value as unknown as ProductoTerminadoIngresadoV1Event;
}
