import {
  SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO,
  SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
} from './inventario-almacen-v1';
import {
  EventoInventarioV1InvalidoError,
  validarCorrelacionSolicitudMaterialInventarioV1,
  validarEventoSolicitudMaterialInventarioV1,
  validarSolicitudMaterialAlmacenEstadoActualizadoV1,
  validarSolicitudMaterialAlmacenV1,
} from './inventario-almacen-v1.validator';

function copia<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function capturarError(ejecutar: () => unknown): EventoInventarioV1InvalidoError {
  try {
    ejecutar();
  } catch (error) {
    expect(error).toBeInstanceOf(EventoInventarioV1InvalidoError);
    return error as EventoInventarioV1InvalidoError;
  }
  throw new Error('Se esperaba un error de validacion');
}

describe('ABC-241: contrato de solicitudes de material con Inventarios', () => {
  it('acepta los ejemplos v1 acordados por el equipo', () => {
    expect(validarSolicitudMaterialAlmacenV1(
      SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
    )).toBe(SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO);
    expect(validarSolicitudMaterialAlmacenEstadoActualizadoV1(
      SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO,
    )).toBe(SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO);
    expect(() => validarCorrelacionSolicitudMaterialInventarioV1(
      SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
      SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO,
    )).not.toThrow();
  });

  it('rechaza una version de contrato diferente de v1', () => {
    const evento = copia(SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO) as any;
    evento.eventType = 'SolicitudMaterialAlmacen.v2';

    const error = capturarError(() => validarEventoSolicitudMaterialInventarioV1(evento));

    expect(error.diagnostico()).toMatchObject({
      codigo: 'EVENTO_INVENTARIO_V1_INVALIDO',
      eventType: 'SolicitudMaterialAlmacen.v2',
      eventId: evento.eventId,
      errores: [expect.objectContaining({ campo: 'eventType' })],
    });
  });

  it('informa todos los identificadores obligatorios ausentes', () => {
    const evento = copia(SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO) as any;
    evento.eventId = '';
    evento.correlationId = '';
    evento.data.solicitudId = '';
    evento.data.solicitanteUsuarioId = '';
    evento.data.items[0].materialId = '';

    const error = capturarError(() => validarSolicitudMaterialAlmacenV1(evento));
    const campos = error.errores.map(({ campo }) => campo);

    expect(campos).toEqual(expect.arrayContaining([
      'eventId',
      'correlationId',
      'data.solicitudId',
      'data.solicitanteUsuarioId',
      'data.items[0].materialId',
    ]));
  });

  it.each(['0', '-1.0000', '1.00001', '1e2', '10000000000.0000'])(
    'rechaza la cantidad invalida %s',
    (cantidad) => {
      const evento = copia(SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO) as any;
      evento.data.items[0].cantidad = cantidad;

      const error = capturarError(() => validarSolicitudMaterialAlmacenV1(evento));

      expect(error.errores).toContainEqual(expect.objectContaining({
        campo: 'data.items[0].cantidad',
      }));
    },
  );

  it('rechaza unidades ajenas al catalogo y materiales repetidos', () => {
    const evento = copia(SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO) as any;
    evento.data.items[0].unidad = 'kilos';
    evento.data.items.push({ ...evento.data.items[0], unidad: 'kg' });

    const error = capturarError(() => validarSolicitudMaterialAlmacenV1(evento));

    expect(error.errores).toEqual(expect.arrayContaining([
      expect.objectContaining({ campo: 'data.items[0].unidad' }),
      expect.objectContaining({ campo: 'data.items[1].materialId' }),
    ]));
  });

  it('rechaza tipos, estado y fecha invalidos en la respuesta', () => {
    const respuesta = copia(
      SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO,
    ) as any;
    respuesta.data.requestEventId = 'evento-no-uuid';
    respuesta.data.ordenId = '15';
    respuesta.data.estadoNuevo = 'RECHAZADA';
    respuesta.data.actualizadoAt = '2026-10-11';

    const error = capturarError(
      () => validarSolicitudMaterialAlmacenEstadoActualizadoV1(respuesta),
    );

    expect(error.errores.map(({ campo }) => campo)).toEqual(expect.arrayContaining([
      'data.requestEventId',
      'data.ordenId',
      'data.estadoNuevo',
      'data.actualizadoAt',
    ]));
  });

  it('rechaza una respuesta que no corresponde a la solicitud original', () => {
    const respuesta = copia(
      SOLICITUD_MATERIAL_ALMACEN_ESTADO_ACTUALIZADO_V1_EJEMPLO,
    );
    respuesta.correlationId = '8a63816a-4375-42ff-ac9f-3b606188e76e';
    respuesta.data.requestEventId = '86111115-f71c-49ec-aa9d-dcbb7dd39ff8';
    respuesta.data.solicitudId = '28';
    respuesta.data.ordenId = 16;
    respuesta.data.solicitudVersion = 1;

    const error = capturarError(() => validarCorrelacionSolicitudMaterialInventarioV1(
      SOLICITUD_MATERIAL_ALMACEN_V1_EJEMPLO,
      respuesta,
    ));

    expect(error.errores.map(({ campo }) => campo)).toEqual(expect.arrayContaining([
      'correlationId',
      'data.requestEventId',
      'data.solicitudId',
      'data.ordenId',
      'data.solicitudVersion',
    ]));
  });
});
