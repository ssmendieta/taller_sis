import { DEMANDA_ATENDIDA_V1 } from './ventas-demanda-atendida-v1';
import type { DemandaAtendidaV1Event } from './ventas-demanda-atendida-v1';

type JsonObject = Record<string, unknown>;

export interface ErrorValidacionDemandaAtendidaV1 {
  campo: string;
  motivo: string;
}

export class DemandaAtendidaV1InvalidoError extends Error {
  readonly codigo = 'DEMANDA_ATENDIDA_V1_INVALIDO' as const;

  constructor(
    readonly eventType: string | undefined,
    readonly eventId: string | undefined,
    readonly errores: ErrorValidacionDemandaAtendidaV1[],
  ) {
    super(
      `DemandaAtendida v1 invalido: ${errores
        .map(({ campo, motivo }) => `${campo}: ${motivo}`)
        .join('; ')}`,
    );
    this.name = 'DemandaAtendidaV1InvalidoError';
  }
}

type Errores = ErrorValidacionDemandaAtendidaV1[];

const MAX_BIGINT_POSTGRES = 9223372036854775807n;
const MAX_CANTIDAD = 9999999999.9999;
const MAX_DEMANDA_EXTERNA_ID = 80;
const MAX_PRODUCTO_CODIGO = 80;
const MAX_UNIDAD = 20;
const ORIGENES = ['VENTAS', 'FACTURACION'];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_CANTIDAD = /^(?:0\.\d{1,4}|[1-9]\d{0,9}(?:\.\d{1,4})?)$/;
const FECHA_HORA_CON_ZONA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function esObjeto(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validarTexto(value: unknown, campo: string, errores: Errores): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    errores.push({ campo, motivo: 'debe ser un texto no vacio' });
    return false;
  }
  return true;
}

function validarTextoConMaximo(
  value: unknown,
  campo: string,
  maximo: number,
  errores: Errores,
): value is string {
  if (!validarTexto(value, campo, errores)) return false;
  if (value.length > maximo) {
    errores.push({ campo, motivo: `debe tener maximo ${maximo} caracteres` });
    return false;
  }
  return true;
}

function validarUuid(value: unknown, campo: string, errores: Errores): void {
  if (validarTexto(value, campo, errores) && !UUID.test(value)) {
    errores.push({ campo, motivo: 'debe ser un UUID' });
  }
}

function validarBigintPositivoComoTexto(value: unknown, campo: string, errores: Errores): void {
  if (!validarTexto(value, campo, errores)) return;
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > MAX_BIGINT_POSTGRES) {
    errores.push({ campo, motivo: 'debe representar un BIGINT positivo' });
  }
}

function validarCantidadPositiva(value: unknown, campo: string, errores: Errores): void {
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

function validarFechaHora(value: unknown, campo: string, errores: Errores): void {
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

function validarItems(value: unknown, errores: Errores): void {
  if (!Array.isArray(value) || value.length === 0) {
    errores.push({ campo: 'data.items', motivo: 'debe ser una lista con al menos un elemento' });
    return;
  }
  const codigos = new Set<string>();
  value.forEach((item, indice) => {
    const base = `data.items[${indice}]`;
    if (!esObjeto(item)) {
      errores.push({ campo: base, motivo: 'debe ser un objeto' });
      return;
    }
    if (validarTextoConMaximo(
      item.productoCodigo, `${base}.productoCodigo`, MAX_PRODUCTO_CODIGO, errores,
    )) {
      if (codigos.has(item.productoCodigo)) {
        errores.push({ campo: `${base}.productoCodigo`, motivo: 'no debe repetirse' });
      }
      codigos.add(item.productoCodigo);
    }
    validarCantidadPositiva(item.cantidadAtendida, `${base}.cantidadAtendida`, errores);
    validarTextoConMaximo(item.unidad, `${base}.unidad`, MAX_UNIDAD, errores);
  });
}

export function validarDemandaAtendidaV1(value: unknown): DemandaAtendidaV1Event {
  const errores: Errores = [];

  if (!esObjeto(value)) {
    throw new DemandaAtendidaV1InvalidoError(undefined, undefined, [
      { campo: '$', motivo: 'debe ser un objeto' },
    ]);
  }

  validarUuid(value.eventId, 'eventId', errores);
  validarUuid(value.correlationId, 'correlationId', errores);
  validarFechaHora(value.occurredAt, 'occurredAt', errores);
  if (value.eventType !== DEMANDA_ATENDIDA_V1) {
    errores.push({ campo: 'eventType', motivo: `debe ser ${DEMANDA_ATENDIDA_V1}` });
  }
  if (value.source !== 'produccion-service') {
    errores.push({ campo: 'source', motivo: 'debe ser produccion-service' });
  }

  if (!esObjeto(value.data)) {
    errores.push({ campo: 'data', motivo: 'debe ser un objeto' });
  } else {
    const data = value.data;
    validarBigintPositivoComoTexto(data.demandaId, 'data.demandaId', errores);
    if (typeof data.origen !== 'string' || !ORIGENES.includes(data.origen)) {
      errores.push({ campo: 'data.origen', motivo: 'debe ser VENTAS o FACTURACION' });
    }
    validarTextoConMaximo(
      data.demandaExternaId, 'data.demandaExternaId', MAX_DEMANDA_EXTERNA_ID, errores,
    );
    validarItems(data.items, errores);
    validarFechaHora(data.fechaAtencion, 'data.fechaAtencion', errores);
  }

  if (errores.length > 0) {
    throw new DemandaAtendidaV1InvalidoError(
      typeof value.eventType === 'string' ? value.eventType : undefined,
      typeof value.eventId === 'string' ? value.eventId : undefined,
      errores,
    );
  }
  return value as unknown as DemandaAtendidaV1Event;
}
