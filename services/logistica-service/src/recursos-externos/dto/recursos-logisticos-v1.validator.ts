import {
  CapacidadV1,
  ChoferErpV1,
  MAX_CAPACIDAD,
  MAX_DESCRIPCION_VEHICULO,
  MAX_ID_EXTERNO,
  MAX_LICENCIA_CATEGORIA,
  MAX_NOMBRE_CHOFER,
  MAX_PLACA,
  RECURSOS_LOGISTICOS_V1,
  RespuestaRecursosErpV1,
  UNIDADES_CAPACIDAD_V1,
  UnidadCapacidadV1,
  VehiculoErpV1,
} from './recursos-logisticos-v1';

type JsonObject = Record<string, unknown>;

export interface ErrorValidacionRecursosV1 {
  campo: string;
  motivo: string;
}

// La respuesta completa se rechaza: una copia parcial no puede reemplazar la válida.
export class RespuestaRecursosV1InvalidaError extends Error {
  readonly codigo = 'RESPUESTA_RECURSOS_V1_INVALIDA' as const;

  constructor(readonly errores: ErrorValidacionRecursosV1[]) {
    super(`Respuesta de recursos v1 invalida: ${errores.map(({ campo, motivo }) => `${campo}: ${motivo}`).join('; ')}`);
    this.name = 'RespuestaRecursosV1InvalidaError';
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;

function esObjeto(valor: unknown): valor is JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

// Cantidades como enteros de diezmilésimas: sin errores de coma flotante.
export function diezmilesimas(valor: string): bigint {
  const [entero, decimales = ''] = valor.split('.');
  return BigInt(entero) * BigInt(10000) + BigInt(decimales.padEnd(4, '0'));
}

export function esFechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== 'string' || !FECHA.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const valor = new Date(Date.UTC(anio, mes - 1, dia));
  return valor.getUTCFullYear() === anio && valor.getUTCMonth() === mes - 1 && valor.getUTCDate() === dia;
}

function textoObligatorio(valor: unknown, campo: string, max: number, errores: ErrorValidacionRecursosV1[]): string {
  if (typeof valor !== 'string' || !valor.trim()) {
    errores.push({ campo, motivo: 'es obligatorio' });
    return '';
  }
  if (valor !== valor.trim()) errores.push({ campo, motivo: 'no admite espacios al inicio o al final' });
  if (valor.length > max) errores.push({ campo, motivo: `admite hasta ${max} caracteres` });
  return valor;
}

function textoOpcional(valor: unknown, campo: string, max: number, errores: ErrorValidacionRecursosV1[]): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') {
    errores.push({ campo, motivo: 'debe ser texto o null' });
    return null;
  }
  if (valor.length > max) errores.push({ campo, motivo: `admite hasta ${max} caracteres` });
  return valor.trim() || null;
}

function booleano(valor: unknown, campo: string, errores: ErrorValidacionRecursosV1[]): boolean {
  if (typeof valor !== 'boolean') errores.push({ campo, motivo: 'debe ser true o false' });
  return valor === true;
}

function capacidad(valor: unknown, campo: string, errores: ErrorValidacionRecursosV1[]): CapacidadV1 {
  if (!esObjeto(valor)) {
    errores.push({ campo, motivo: 'debe incluir valor y unidad' });
    return { valor: '0', unidad: 'kg' };
  }
  const texto = valor.valor;
  if (typeof texto !== 'string' || !DECIMAL.test(texto)) {
    errores.push({ campo: `${campo}.valor`, motivo: 'debe ser texto decimal con hasta 4 decimales' });
  } else if (diezmilesimas(texto) <= BigInt(0)) {
    errores.push({ campo: `${campo}.valor`, motivo: 'debe ser mayor que cero' });
  } else if (diezmilesimas(texto) > diezmilesimas(MAX_CAPACIDAD)) {
    errores.push({ campo: `${campo}.valor`, motivo: `no puede superar ${MAX_CAPACIDAD}` });
  }
  if (!UNIDADES_CAPACIDAD_V1.includes(valor.unidad as UnidadCapacidadV1)) {
    errores.push({ campo: `${campo}.unidad`, motivo: `debe ser una de ${UNIDADES_CAPACIDAD_V1.join(', ')}` });
  }
  return { valor: typeof texto === 'string' ? texto : '0', unidad: valor.unidad as UnidadCapacidadV1 };
}

function sinDuplicados(lista: { idExterno: string }[], campo: string, errores: ErrorValidacionRecursosV1[]) {
  const vistos = new Set<string>();
  lista.forEach(({ idExterno }, indice) => {
    if (!idExterno) return;
    if (vistos.has(idExterno)) errores.push({ campo: `${campo}[${indice}].idExterno`, motivo: `duplicado: ${idExterno}` });
    vistos.add(idExterno);
  });
}

// Valida y normaliza la respuesta del ERP para la fecha consultada. Los campos
// adicionales se ignoran (compatibilidad hacia adelante) y no se conservan.
export function validarRespuestaRecursosV1(cuerpo: unknown, fechaSolicitada: string): RespuestaRecursosErpV1 {
  const errores: ErrorValidacionRecursosV1[] = [];
  if (!esObjeto(cuerpo)) throw new RespuestaRecursosV1InvalidaError([{ campo: '$', motivo: 'debe ser un objeto JSON' }]);

  if (cuerpo.version !== RECURSOS_LOGISTICOS_V1) errores.push({ campo: 'version', motivo: `debe ser ${RECURSOS_LOGISTICOS_V1}` });
  if (!esFechaValida(cuerpo.fecha)) errores.push({ campo: 'fecha', motivo: 'debe ser una fecha AAAA-MM-DD válida' });
  else if (cuerpo.fecha !== fechaSolicitada) errores.push({ campo: 'fecha', motivo: `no corresponde a la fecha consultada ${fechaSolicitada}` });
  if (typeof cuerpo.generadoEn !== 'string' || Number.isNaN(Date.parse(cuerpo.generadoEn))) {
    errores.push({ campo: 'generadoEn', motivo: 'debe ser una fecha y hora ISO 8601' });
  }

  const vehiculos: VehiculoErpV1[] = [];
  if (!Array.isArray(cuerpo.vehiculos)) errores.push({ campo: 'vehiculos', motivo: 'debe ser una lista' });
  else cuerpo.vehiculos.forEach((item, i) => {
    const campo = `vehiculos[${i}]`;
    if (!esObjeto(item)) {
      errores.push({ campo, motivo: 'debe ser un objeto' });
      return;
    }
    vehiculos.push({
      idExterno: textoObligatorio(item.idExterno, `${campo}.idExterno`, MAX_ID_EXTERNO, errores),
      placa: textoObligatorio(item.placa, `${campo}.placa`, MAX_PLACA, errores),
      descripcion: textoOpcional(item.descripcion, `${campo}.descripcion`, MAX_DESCRIPCION_VEHICULO, errores),
      capacidad: capacidad(item.capacidad, `${campo}.capacidad`, errores),
      disponible: booleano(item.disponible, `${campo}.disponible`, errores),
    });
  });

  const choferes: ChoferErpV1[] = [];
  if (!Array.isArray(cuerpo.choferes)) errores.push({ campo: 'choferes', motivo: 'debe ser una lista' });
  else cuerpo.choferes.forEach((item, i) => {
    const campo = `choferes[${i}]`;
    if (!esObjeto(item)) {
      errores.push({ campo, motivo: 'debe ser un objeto' });
      return;
    }
    choferes.push({
      idExterno: textoObligatorio(item.idExterno, `${campo}.idExterno`, MAX_ID_EXTERNO, errores),
      nombre: textoObligatorio(item.nombre, `${campo}.nombre`, MAX_NOMBRE_CHOFER, errores),
      licenciaCategoria: textoOpcional(item.licenciaCategoria, `${campo}.licenciaCategoria`, MAX_LICENCIA_CATEGORIA, errores),
      disponible: booleano(item.disponible, `${campo}.disponible`, errores),
    });
  });

  sinDuplicados(vehiculos, 'vehiculos', errores);
  sinDuplicados(choferes, 'choferes', errores);
  if (errores.length) throw new RespuestaRecursosV1InvalidaError(errores);

  return {
    version: RECURSOS_LOGISTICOS_V1,
    fecha: cuerpo.fecha as string,
    generadoEn: cuerpo.generadoEn as string,
    vehiculos,
    choferes,
  };
}

// Base para ABC-371: compara sin convertir unidades; kg nunca se compara con l.
export type ResultadoCapacidadV1 = 'SUFICIENTE' | 'INSUFICIENTE' | 'UNIDAD_INCOMPATIBLE';

export function compararCapacidad(disponible: CapacidadV1, requerida: CapacidadV1): ResultadoCapacidadV1 {
  if (disponible.unidad !== requerida.unidad) return 'UNIDAD_INCOMPATIBLE';
  return diezmilesimas(disponible.valor) >= diezmilesimas(requerida.valor) ? 'SUFICIENTE' : 'INSUFICIENTE';
}
