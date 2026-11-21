import { PRODUCTO_TERMINADO_INGRESADO_V1_EJEMPLO } from './producto-terminado-ingresado-v1';
import {
  ProductoTerminadoIngresadoV1InvalidoError,
  validarProductoTerminadoIngresadoV1,
} from './producto-terminado-ingresado-v1.validator';

function copia(): any {
  return JSON.parse(JSON.stringify(PRODUCTO_TERMINADO_INGRESADO_V1_EJEMPLO));
}

function campos(evento: unknown): string[] {
  try {
    validarProductoTerminadoIngresadoV1(evento);
  } catch (error) {
    expect(error).toBeInstanceOf(ProductoTerminadoIngresadoV1InvalidoError);
    return (error as ProductoTerminadoIngresadoV1InvalidoError).errores.map((e) => e.campo);
  }
  throw new Error('Se esperaba un error de validacion');
}

describe('ABC-437: contrato ProductoTerminadoIngresado v1', () => {
  it('acepta el ejemplo documentado', () => {
    expect(validarProductoTerminadoIngresadoV1(PRODUCTO_TERMINADO_INGRESADO_V1_EJEMPLO))
      .toBe(PRODUCTO_TERMINADO_INGRESADO_V1_EJEMPLO);
  });

  it.each([
    'loteId', 'loteCodigo', 'ordenId', 'ordenCodigo',
    'productoId', 'cantidadConforme', 'fechaIngreso',
  ])('rechaza el mensaje sin data.%s', (campo) => {
    const evento = copia();
    delete evento.data[campo];
    expect(campos(evento)).toEqual([`data.${campo}`]);
  });

  it.each(['eventId', 'eventType', 'occurredAt', 'source', 'correlationId', 'data'])(
    'rechaza el mensaje sin %s',
    (campo) => {
      const evento = copia();
      delete evento[campo];
      expect(campos(evento)).toContain(campo);
    },
  );

  it('rechaza una version distinta de v1', () => {
    const evento = copia();
    evento.eventType = 'ProductoTerminadoIngresado.v2';
    expect(campos(evento)).toEqual(['eventType']);
  });

  it('rechaza un source distinto de produccion-service', () => {
    const evento = copia();
    evento.source = 'otro-service';
    expect(campos(evento)).toEqual(['source']);
  });

  it.each(['0', '0.0000', '-1', '1.12345', 'abc', '10000000000'])(
    'rechaza cantidadConforme %s',
    (cantidad) => {
      const evento = copia();
      evento.data.cantidadConforme = cantidad;
      expect(campos(evento)).toEqual(['data.cantidadConforme']);
    },
  );

  it('rechaza fechas sin zona horaria o inexistentes', () => {
    const evento = copia();
    evento.data.fechaIngreso = '2026-11-20T15:30:00';
    expect(campos(evento)).toEqual(['data.fechaIngreso']);
    evento.data.fechaIngreso = '2026-02-31T15:30:00Z';
    expect(campos(evento)).toEqual(['data.fechaIngreso']);
  });

  it('rechaza identificadores invalidos', () => {
    const evento = copia();
    evento.eventId = 'no-es-uuid';
    evento.data.loteId = '0';
    evento.data.productoId = '1.5';
    expect(campos(evento)).toEqual(['eventId', 'data.loteId', 'data.productoId']);
  });

  it('rechaza valores que no son objeto', () => {
    expect(campos(null)).toEqual(['$']);
    expect(campos([])).toEqual(['$']);
  });
});
