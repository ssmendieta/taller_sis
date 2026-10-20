'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SOLICITUD_MATERIAL_ALMACEN_V1,
  SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1,
  DISPONIBILIDAD_MATERIAL_SOLICITADA_V1,
  DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1,
  MensajePermanenteError,
  crearRespuesta,
  crearRespuestaDisponibilidad,
  validarEntrada,
  validarSolicitudDisponibilidad,
} = require('./contract');

function disponibilidadValida() {
  return {
    eventId: 'd59541e7-d44c-4138-92e1-3432310cd1aa',
    eventType: DISPONIBILIDAD_MATERIAL_SOLICITADA_V1,
    occurredAt: '2026-10-19T10:00:00.000Z',
    source: 'produccion-service',
    correlationId: '67bfbe4d-9a02-4cb9-b707-d68434ba2c4a',
    data: {
      consultaId: 'DISP-ORD-6-V1',
      consultaVersion: 1,
      ordenId: 6,
      ordenCodigo: 'ORD-0006',
      fechaNecesaria: '2026-10-20',
      materiales: [{
        materialId: '8', materialCodigo: 'HAR-001', materialNombre: 'Harina',
        cantidadRequerida: '100.0000', unidad: 'kg',
      }],
    },
  };
}

test('simulador valida y responde una consulta de disponibilidad correlacionada', () => {
  const solicitud = disponibilidadValida();
  validarSolicitudDisponibilidad(solicitud, {
    eventId: solicitud.eventId,
    eventType: solicitud.eventType,
    source: solicitud.source,
    correlationId: solicitud.correlationId,
  });

  const respuesta = crearRespuestaDisponibilidad(solicitud, {
    now: new Date('2026-10-19T10:00:02.000Z'),
  });
  assert.equal(respuesta.eventType, DISPONIBILIDAD_MATERIAL_RESPONDIDA_V1);
  assert.equal(respuesta.source, 'inventario-service');
  assert.equal(respuesta.correlationId, solicitud.correlationId);
  assert.equal(respuesta.data.requestEventId, solicitud.eventId);
  assert.equal(respuesta.data.consultaId, solicitud.data.consultaId);
  assert.equal(respuesta.data.materiales[0].cantidadDisponible, '100.0000');
  assert.equal(respuesta.data.materiales[0].estado, 'SUFICIENTE');
});

test('simulador representa stock insuficiente y faltante con estados coherentes', () => {
  const solicitud = disponibilidadValida();
  const insuficiente = crearRespuestaDisponibilidad(solicitud, { stock: { 'HAR-001': 50 } });
  const faltante = crearRespuestaDisponibilidad(solicitud, { stock: { 'HAR-001': 0 } });
  assert.equal(insuficiente.data.materiales[0].estado, 'INSUFICIENTE');
  assert.equal(insuficiente.data.materiales[0].cantidadDisponible, '50.0000');
  assert.equal(faltante.data.materiales[0].estado, 'FALTANTE');
});

function muestraValida() {
  return {
    eventId: 'de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6',
    eventType: SOLICITUD_MATERIAL_ALMACEN_V1,
    occurredAt: '2026-10-18T10:00:00.000Z',
    source: 'produccion-service',
    correlationId: '81a265f2-15ec-430c-98e5-e1fa08bb7412',
    data: {
      solicitudId: '27',
      solicitudVersion: 1,
      ordenId: 15,
      ordenCodigo: 'ORD-0015',
      solicitanteUsuarioId: '42',
      fechaNecesaria: '2026-10-20',
      items: [
        {
          materialId: '8',
          materialCodigo: 'HAR-001',
          materialNombre: 'Harina de trigo',
          cantidad: '12.5000',
          unidad: 'kg',
        },
      ],
    },
  };
}

test('validarEntrada acepta una solicitud bien formada', () => {
  const muestra = muestraValida();
  const attributes = {
    eventId: muestra.eventId,
    eventType: muestra.eventType,
    correlationId: muestra.correlationId,
    source: muestra.source,
  };
  const resultado = validarEntrada(muestra, attributes);
  assert.equal(resultado.eventId, muestra.eventId);
  assert.equal(resultado.data.solicitudId, '27');
  assert.equal(resultado.data.items[0].unidad, 'kg');
});

test('validarEntrada rechaza eventType no soportado (ej. MaterialesSolicitados.v1)', () => {
  const muestra = muestraValida();
  muestra.eventType = 'MaterialesSolicitados.v1';
  assert.throws(
    () => validarEntrada(muestra),
    (err) => err instanceof MensajePermanenteError && err.message.includes('eventType no soportado'),
  );
});

test('validarEntrada rechaza source que no sea produccion-service', () => {
  const muestra = muestraValida();
  muestra.source = 'otro-servicio';
  assert.throws(
    () => validarEntrada(muestra),
    (err) => err instanceof MensajePermanenteError && err.message.includes('source no valido'),
  );
});

test('validarEntrada rechaza UUIDs invalidos', () => {
  const muestra = muestraValida();
  muestra.eventId = 'no-es-un-uuid';
  assert.throws(
    () => validarEntrada(muestra),
    (err) => err instanceof MensajePermanenteError && err.message.includes('eventId invalido'),
  );

  const muestra2 = muestraValida();
  muestra2.correlationId = 'no-es-un-uuid';
  assert.throws(
    () => validarEntrada(muestra2),
    (err) => err instanceof MensajePermanenteError && err.message.includes('correlationId invalido'),
  );
});

test('validarEntrada rechaza atributos de Pub/Sub discrepantes', () => {
  const muestra = muestraValida();
  const attributes = {
    eventId: '00000000-0000-0000-0000-000000000000',
  };
  assert.throws(
    () => validarEntrada(muestra, attributes),
    (err) => err instanceof MensajePermanenteError && err.message.includes('attributes.eventId'),
  );
});

test('validarEntrada rechaza items vacios o repetidos', () => {
  const muestra = muestraValida();
  muestra.data.items = [];
  assert.throws(
    () => validarEntrada(muestra),
    (err) => err instanceof MensajePermanenteError && err.message.includes('al menos un item'),
  );

  const muestraRepetida = muestraValida();
  muestraRepetida.data.items.push({
    materialId: '8', // Id repetido
    materialCodigo: 'HAR-001-B',
    materialNombre: 'Harina repetida',
    cantidad: '5.0000',
    unidad: 'kg',
  });
  assert.throws(
    () => validarEntrada(muestraRepetida),
    (err) => err instanceof MensajePermanenteError && err.message.includes('no debe repetirse'),
  );
});

test('validarEntrada rechaza unidades invalidas o cantidades con mas de 4 decimales', () => {
  const muestraUnidad = muestraValida();
  muestraUnidad.data.items[0].unidad = 'kilos'; // No es catalogo
  assert.throws(
    () => validarEntrada(muestraUnidad),
    (err) => err instanceof MensajePermanenteError && err.message.includes('catalogo de unidades'),
  );

  const muestraCantidad = muestraValida();
  muestraCantidad.data.items[0].cantidad = '12.55555'; // 5 decimales
  assert.throws(
    () => validarEntrada(muestraCantidad),
    (err) => err instanceof MensajePermanenteError && err.message.includes('hasta 4 decimales'),
  );
});

test('crearRespuesta genera evento de aceptacion APROBADA con version incrementada', () => {
  const solicitud = muestraValida();
  const now = new Date('2026-10-18T10:05:00.000Z');
  const respuesta = crearRespuesta(solicitud, { now });

  assert.equal(respuesta.eventType, SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1);
  assert.equal(respuesta.source, 'almacen-service');
  assert.equal(respuesta.correlationId, solicitud.correlationId);
  assert.equal(respuesta.data.solicitudId, '27');
  assert.equal(respuesta.data.solicitudVersion, 2); // 1 + 1
  assert.equal(respuesta.data.requestEventId, solicitud.eventId);
  assert.equal(respuesta.data.ordenId, 15);
  assert.equal(respuesta.data.estadoAnterior, 'PENDIENTE');
  assert.equal(respuesta.data.estadoNuevo, 'APROBADA');
  assert.equal(respuesta.data.actualizadoAt, now.toISOString());
});

test('crearRespuesta genera evento de rechazo CANCELADA en modo rechazo', () => {
  const solicitud = muestraValida();
  const respuesta = crearRespuesta(solicitud, { modoRechazo: true });

  assert.equal(respuesta.data.estadoNuevo, 'CANCELADA');
  assert.ok(respuesta.data.motivo.includes('Stock insuficiente'));
});

test('crearRespuesta genera rechazo automatico si un material tiene SIN_STOCK', () => {
  const solicitud = muestraValida();
  solicitud.data.items[0].materialCodigo = 'MAT-SIN_STOCK-01';
  const respuesta = crearRespuesta(solicitud);

  assert.equal(respuesta.data.estadoNuevo, 'CANCELADA');
});
