import {
  DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO,
  SALIDA_INVENTARIO_RECHAZADA_V1_EJEMPLO,
  SALIDA_INVENTARIO_RESULTADO_V1_EJEMPLO,
} from './inventarios-salida-v1';
import {
  EventoSalidaV1InvalidoError,
  validarDespachoRutaRegistradoV1,
  validarSalidaInventarioResultadoV1,
} from './inventarios-salida-v1.validator';

const despacho = () => structuredClone(DESPACHO_RUTA_REGISTRADO_V1_EJEMPLO) as any;
const resultado = () => structuredClone(SALIDA_INVENTARIO_RESULTADO_V1_EJEMPLO) as any;
const campos = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof EventoSalidaV1InvalidoError) return error.errores.map((e) => e.campo);
    throw error;
  }
  return [];
};

describe('ABC-385: DespachoRutaRegistrado.v1', () => {
  it('acepta el ejemplo del contrato', () => {
    expect(validarDespachoRutaRegistradoV1(despacho()).data.rutaId).toBe('9');
  });

  it.each([
    ['tipo distinto', (e: any) => { e.eventType = 'Otro.v1'; }, 'eventType'],
    ['eventId no UUID', (e: any) => { e.eventId = '1'; }, 'eventId'],
    ['otra fuente', (e: any) => { e.source = 'produccion-service'; }, 'source'],
    ['occurredAt sin zona', (e: any) => { e.occurredAt = '2026-11-12T14:00:00'; }, 'occurredAt'],
    ['ruta no numérica', (e: any) => { e.data.rutaId = 'R9'; }, 'data.rutaId'],
    ['sin boletas', (e: any) => { e.data.boletas = []; }, 'data.boletas'],
    ['boleta repetida', (e: any) => { e.data.boletas.push(structuredClone(e.data.boletas[0])); }, 'data.boletas[1].boletaId'],
    ['boleta sin ítems', (e: any) => { e.data.boletas[0].items = []; }, 'data.boletas[0].items'],
    ['producto vacío', (e: any) => { e.data.boletas[0].productoCodigo = ' '; }, 'data.boletas[0].productoCodigo'],
    ['unidad desconocida', (e: any) => { e.data.boletas[0].unidad = 'bulto'; }, 'data.boletas[0].unidad'],
    ['cantidad sin 4 decimales', (e: any) => { e.data.boletas[0].items[0].cantidad = '6'; }, 'data.boletas[0].items[0].cantidad'],
    ['cantidad cero', (e: any) => { e.data.boletas[0].items[0].cantidad = '0.0000'; }, 'data.boletas[0].items[0].cantidad'],
    ['lote vacío', (e: any) => { e.data.boletas[0].items[0].loteReferencia = ' '; }, 'data.boletas[0].items[0].loteReferencia'],
  ])('rechaza %s', (_caso, mutar, campo) => {
    const e = despacho();
    mutar(e);
    expect(campos(() => validarDespachoRutaRegistradoV1(e))).toContain(campo);
  });
});

describe('ABC-385: SalidaInventarioResultado.v1', () => {
  it('acepta una salida ACEPTADA y una RECHAZADA con código', () => {
    expect(validarSalidaInventarioResultadoV1(resultado()).data.estado).toBe('ACEPTADA');
    const rechazada = structuredClone(SALIDA_INVENTARIO_RECHAZADA_V1_EJEMPLO);
    expect(validarSalidaInventarioResultadoV1(rechazada).data.codigoRechazo).toBe('LOTE_SIN_STOCK');
  });

  it.each([
    ['fuente distinta de Inventarios', (e: any) => { e.source = 'logistica-service'; }, 'source'],
    ['estado desconocido', (e: any) => { e.data.estado = 'APROBADA'; }, 'data.estado'],
    ['rechazo sin código', (e: any) => { e.data.estado = 'RECHAZADA'; }, 'data.codigoRechazo'],
    ['aceptada con código', (e: any) => { e.data.codigoRechazo = 'X'; }, 'data.codigoRechazo'],
    ['requestEventId inválido', (e: any) => { e.data.requestEventId = 'abc'; }, 'data.requestEventId'],
    ['detalle muy largo', (e: any) => { e.data.detalle = 'x'.repeat(501); }, 'data.detalle'],
    ['no es objeto', () => undefined, 'evento'],
  ])('rechaza %s', (caso, mutar, campo) => {
    const e = caso === 'no es objeto' ? 'texto' : resultado();
    if (typeof e === 'object') mutar(e);
    expect(campos(() => validarSalidaInventarioResultadoV1(e))).toContain(campo);
  });
});
