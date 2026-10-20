'use strict';

const { randomUUID } = require('node:crypto');

const SOLICITUD_MATERIAL_ALMACEN_V1 = 'SolicitudMaterialAlmacen.v1';
const SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1 = 'SolicitudMaterialAlmacenEstadoActualizado.v1';
const DISPONIBILIDAD_MATERIAL_SOLICITADA_V1 = 'DisponibilidadMaterialSolicitada.v1';
const DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1 = 'DisponibilidadMaterialRespondida.v1';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_CANTIDAD_REGEX = /^(?:0\.\d{1,4}|[1-9]\d{0,9}(?:\.\d{1,4})?)$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const BIGINT_TEXTO_REGEX = /^[1-9]\d*$/;
const UNIDADES_VALIDAS = new Set(['kg', 'g', 'l', 'ml', 'm', 'cm', 'unidad', 'docena', 'caja', 'paquete']);

class MensajePermanenteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MensajePermanenteError';
  }
}

function validarEntrada(value, attributes = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MensajePermanenteError('El payload debe ser un objeto');
  }

  for (const campo of ['eventId', 'eventType', 'occurredAt', 'source', 'correlationId']) {
    if (typeof value[campo] !== 'string' || !value[campo].trim()) {
      throw new MensajePermanenteError(`Falta el campo obligatorio de sobre: ${campo}`);
    }
  }

  if (!UUID_REGEX.test(value.eventId)) {
    throw new MensajePermanenteError(`eventId invalido: ${value.eventId} (debe ser UUID)`);
  }
  if (!UUID_REGEX.test(value.correlationId)) {
    throw new MensajePermanenteError(`correlationId invalido: ${value.correlationId} (debe ser UUID)`);
  }

  if (value.eventType !== SOLICITUD_MATERIAL_ALMACEN_V1) {
    throw new MensajePermanenteError(
      `eventType no soportado: "${value.eventType}". Se requiere exactamente "${SOLICITUD_MATERIAL_ALMACEN_V1}"`,
    );
  }

  if (value.source !== 'produccion-service') {
    throw new MensajePermanenteError(
      `source no valido: "${value.source}". Se requiere "produccion-service"`,
    );
  }

  // Si se proveen atributos de Pub/Sub, deben coincidir con el payload
  for (const campo of ['eventId', 'eventType', 'correlationId', 'source']) {
    if (attributes[campo] && attributes[campo] !== value[campo]) {
      throw new MensajePermanenteError(
        `attributes.${campo} ("${attributes[campo]}") no coincide con el payload ("${value[campo]}")`,
      );
    }
  }

  const data = value.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new MensajePermanenteError('El campo data debe ser un objeto');
  }

  if (typeof data.solicitudId !== 'string' || !BIGINT_TEXTO_REGEX.test(data.solicitudId)) {
    throw new MensajePermanenteError('data.solicitudId debe ser un ID numerico positivo en texto');
  }

  if (!Number.isSafeInteger(data.solicitudVersion) || data.solicitudVersion < 1) {
    throw new MensajePermanenteError('data.solicitudVersion debe ser un entero positivo >= 1');
  }

  if (!Number.isSafeInteger(data.ordenId) || data.ordenId < 1) {
    throw new MensajePermanenteError('data.ordenId debe ser un entero positivo >= 1');
  }

  if (typeof data.ordenCodigo !== 'string' || !data.ordenCodigo.trim()) {
    throw new MensajePermanenteError('data.ordenCodigo debe ser un texto no vacio');
  }

  if (typeof data.solicitanteUsuarioId !== 'string' || !BIGINT_TEXTO_REGEX.test(data.solicitanteUsuarioId)) {
    throw new MensajePermanenteError('data.solicitanteUsuarioId debe ser un ID numerico positivo en texto');
  }

  if (typeof data.fechaNecesaria !== 'string' || !FECHA_REGEX.test(data.fechaNecesaria)) {
    throw new MensajePermanenteError('data.fechaNecesaria debe tener formato YYYY-MM-DD');
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new MensajePermanenteError('data.items debe contener al menos un item');
  }

  const materiales = new Set();
  data.items.forEach((item, index) => {
    const prefijo = `data.items[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new MensajePermanenteError(`${prefijo} debe ser un objeto`);
    }

    if (typeof item.materialId !== 'string' || !BIGINT_TEXTO_REGEX.test(item.materialId)) {
      throw new MensajePermanenteError(`${prefijo}.materialId debe ser un entero positivo en texto`);
    }

    if (materiales.has(item.materialId)) {
      throw new MensajePermanenteError(`${prefijo}.materialId ${item.materialId} no debe repetirse en la misma solicitud`);
    }
    materiales.add(item.materialId);

    if (typeof item.materialCodigo !== 'string' || !item.materialCodigo.trim()) {
      throw new MensajePermanenteError(`${prefijo}.materialCodigo debe ser un texto no vacio`);
    }

    if (typeof item.materialNombre !== 'string' || !item.materialNombre.trim()) {
      throw new MensajePermanenteError(`${prefijo}.materialNombre debe ser un texto no vacio`);
    }

    if (typeof item.cantidad !== 'string' || !DECIMAL_CANTIDAD_REGEX.test(item.cantidad)) {
      throw new MensajePermanenteError(`${prefijo}.cantidad debe ser un decimal positivo con hasta 4 decimales`);
    }

    if (typeof item.unidad !== 'string' || !UNIDADES_VALIDAS.has(item.unidad)) {
      throw new MensajePermanenteError(`${prefijo}.unidad "${item.unidad}" debe pertenecer al catalogo de unidades`);
    }
  });

  return value;
}

function crearRespuesta(solicitud, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const eventId = options.eventId || randomUUID();

  // El modo rechazo puede forzarse via options, variable de entorno,
  // o si algun material contiene la marca 'SIN_STOCK' en codigo o nombre
  const tieneSinStock = solicitud.data.items.some((it) =>
    (it.materialCodigo && it.materialCodigo.toUpperCase().includes('SIN_STOCK')) ||
    (it.materialNombre && it.materialNombre.toUpperCase().includes('SIN_STOCK'))
  );

  const forzarRechazo = options.modoRechazo === true ||
    /^(true|1|yes)$/i.test(process.env.INVENTARIOS_SIMULADOR_RECHAZAR || '') ||
    tieneSinStock;

  const estadoNuevo = forzarRechazo ? 'CANCELADA' : 'APROBADA';
  const motivo = options.motivo || (
    forzarRechazo
      ? 'Stock insuficiente en almacen para cubrir los materiales solicitados'
      : 'Materiales disponibles y reservados exitosamente en inventarios'
  );

  return {
    eventId,
    eventType: SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1,
    occurredAt: now.toISOString(),
    source: 'almacen-service',
    correlationId: solicitud.correlationId,
    data: {
      solicitudId: solicitud.data.solicitudId,
      solicitudVersion: solicitud.data.solicitudVersion + 1,
      requestEventId: solicitud.eventId,
      ordenId: solicitud.data.ordenId,
      estadoAnterior: 'PENDIENTE',
      estadoNuevo,
      actualizadoAt: now.toISOString(),
      motivo,
    },
  };
}

function validarSolicitudDisponibilidad(value, attributes = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MensajePermanenteError('El payload debe ser un objeto');
  }
  for (const campo of ['eventId', 'eventType', 'occurredAt', 'source', 'correlationId']) {
    if (typeof value[campo] !== 'string' || !value[campo].trim()) {
      throw new MensajePermanenteError(`Falta el campo obligatorio de sobre: ${campo}`);
    }
  }
  if (!UUID_REGEX.test(value.eventId) || !UUID_REGEX.test(value.correlationId)) {
    throw new MensajePermanenteError('eventId y correlationId deben ser UUID válidos');
  }
  if (value.eventType !== DISPONIBILIDAD_MATERIAL_SOLICITADA_V1 || value.source !== 'produccion-service') {
    throw new MensajePermanenteError('Se esperaba DisponibilidadMaterialSolicitada.v1 de produccion-service');
  }
  for (const campo of ['eventId', 'eventType', 'correlationId', 'source']) {
    if (attributes[campo] && attributes[campo] !== value[campo]) {
      throw new MensajePermanenteError(`attributes.${campo} no coincide con el payload`);
    }
  }
  const data = value.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new MensajePermanenteError('El campo data debe ser un objeto');
  }
  if (typeof data.consultaId !== 'string' || !data.consultaId.trim()) {
    throw new MensajePermanenteError('data.consultaId es obligatorio');
  }
  if (!Number.isSafeInteger(data.consultaVersion) || data.consultaVersion < 1
    || !Number.isSafeInteger(data.ordenId) || data.ordenId < 1) {
    throw new MensajePermanenteError('consultaVersion y ordenId deben ser enteros positivos');
  }
  if (typeof data.ordenCodigo !== 'string' || !data.ordenCodigo.trim()
    || typeof data.fechaNecesaria !== 'string' || !FECHA_REGEX.test(data.fechaNecesaria)) {
    throw new MensajePermanenteError('ordenCodigo y fechaNecesaria son obligatorios');
  }
  if (!Array.isArray(data.materiales) || data.materiales.length === 0) {
    throw new MensajePermanenteError('data.materiales debe contener al menos un material');
  }
  const ids = new Set();
  for (const [index, item] of data.materiales.entries()) {
    const prefix = `data.materiales[${index}]`;
    if (!item || typeof item !== 'object' || !/^\d+$/.test(item.materialId ?? '')) {
      throw new MensajePermanenteError(`${prefix}.materialId debe ser un ID numérico`);
    }
    if (ids.has(item.materialId)) throw new MensajePermanenteError(`${prefix}.materialId está repetido`);
    ids.add(item.materialId);
    for (const campo of ['materialCodigo', 'materialNombre', 'unidad']) {
      if (typeof item[campo] !== 'string' || !item[campo].trim()) {
        throw new MensajePermanenteError(`${prefix}.${campo} es obligatorio`);
      }
    }
    if (!UNIDADES_VALIDAS.has(item.unidad)) {
      throw new MensajePermanenteError(`${prefix}.unidad no pertenece al catálogo de unidades`);
    }
    if (typeof item.cantidadRequerida !== 'string'
      || !DECIMAL_CANTIDAD_REGEX.test(item.cantidadRequerida)) {
      throw new MensajePermanenteError(`${prefix}.cantidadRequerida debe ser positiva con hasta 4 decimales`);
    }
  }
  return value;
}

function crearRespuestaDisponibilidad(solicitud, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const stock = options.stock ?? {};
  const materiales = solicitud.data.materiales.map((item) => {
    const requerido = Number(item.cantidadRequerida);
    // Para una demo reproducible, si no se configura stock se simula lo justo para cubrir la receta.
    const disponible = Number(stock[item.materialCodigo] ?? stock[item.materialId] ?? requerido);
    if (!Number.isFinite(disponible) || disponible < 0) {
      throw new Error(`Stock inválido para ${item.materialCodigo}`);
    }
    const estado = disponible === 0 ? 'FALTANTE'
      : disponible < requerido ? 'INSUFICIENTE' : 'SUFICIENTE';
    return { ...item, cantidadDisponible: disponible.toFixed(4), estado };
  });
  return {
    eventId: options.eventId || randomUUID(),
    eventType: DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1,
    occurredAt: now.toISOString(),
    source: 'inventario-service',
    correlationId: solicitud.correlationId,
    data: {
      consultaId: solicitud.data.consultaId,
      consultaVersion: solicitud.data.consultaVersion,
      requestEventId: solicitud.eventId,
      ordenId: solicitud.data.ordenId,
      vigenteAt: now.toISOString(),
      materiales,
    },
  };
}

module.exports = {
  MensajePermanenteError,
  SOLICITUD_MATERIAL_ALMACEN_V1,
  SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1,
  DISPONIBILIDAD_MATERIAL_SOLICITADA_V1,
  DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1,
  UNIDADES_VALIDAS,
  crearRespuesta,
  validarSolicitudDisponibilidad,
  crearRespuestaDisponibilidad,
  validarEntrada,
};
