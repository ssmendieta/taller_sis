import { PRODUCCION_CERRADA_V1_EJEMPLO, REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO } from './contabilidad-v1';
import {
  EventoContabilidadV1InvalidoError,
  validarCostoBaseProduccionCerradaV1,
  validarRegistroContableResultadoV1,
} from './contabilidad-v1.validator';

describe('ABC-345: costo base de ProduccionCerrada.v1', () => {
  it('acepta el ejemplo con costo y un evento anterior sin campos de costo', () => {
    expect(validarCostoBaseProduccionCerradaV1(PRODUCCION_CERRADA_V1_EJEMPLO)).toEqual(PRODUCCION_CERRADA_V1_EJEMPLO);
    const anterior = structuredClone(PRODUCCION_CERRADA_V1_EJEMPLO) as any;
    delete anterior.data.costoBase;
    anterior.data.consumos = anterior.data.consumos.map(
      ({ estadoCosto, costoUnitario, costoTotal, ...resto }: any) => resto,
    );
    expect(validarCostoBaseProduccionCerradaV1(anterior)).toEqual(anterior);
  });

  it.each([
    ['moneda distinta de BOB', (e: any) => { e.data.costoBase.moneda = 'USD'; }, 'data.costoBase.moneda'],
    ['importe en consumo PENDIENTE', (e: any) => { e.data.consumos[0].estadoCosto = 'PENDIENTE'; }, 'costoUnitario'],
    ['monto con precision distinta de 4', (e: any) => { e.data.consumos[0].costoTotal = '106.25'; }, 'costoTotal'],
    ['total en costo PARCIAL', (e: any) => {
      Object.assign(e.data.consumos[0], { estadoCosto: 'PENDIENTE', costoUnitario: undefined, costoTotal: undefined });
      e.data.costoBase.estado = 'PARCIAL';
    }, 'data.costoBase.total'],
    ['COMPLETO sin total', (e: any) => { delete e.data.costoBase.total; }, 'data.costoBase.total'],
  ])('rechaza %s', (_nombre, mutar, campo) => {
    const evento = structuredClone(PRODUCCION_CERRADA_V1_EJEMPLO) as any;
    mutar(evento);
    expect(() => validarCostoBaseProduccionCerradaV1(evento)).toThrow(campo);
  });
});

describe('RegistroContableResultado.v1', () => {
  it('acepta RECIBIDO y exige codigo para RECHAZADO', () => {
    expect(validarRegistroContableResultadoV1(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO))
      .toEqual(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO);
    const rechazado = structuredClone(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO);
    rechazado.data.estado = 'RECHAZADO';
    expect(() => validarRegistroContableResultadoV1(rechazado)).toThrow(EventoContabilidadV1InvalidoError);
    rechazado.data.codigoRechazo = 'SIN_PRODUCCION_CONFORME';
    expect(validarRegistroContableResultadoV1(rechazado)).toEqual(rechazado);
  });

  it('rechaza sobre, estado y referencia invalidos', () => {
    const invalido = structuredClone(REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO) as any;
    invalido.eventType = 'Desconocido.v1';
    invalido.data.requestEventId = 'no-uuid';
    invalido.data.estado = 'APROBADO';
    expect(() => validarRegistroContableResultadoV1(invalido)).toThrow(EventoContabilidadV1InvalidoError);
  });
  it.each([
    [{ estado: ['RECIBIDO'] }, 'estado'],
    [{ estado: 'RECHAZADO', codigoRechazo: 'x'.repeat(101) }, 'codigoRechazo'],
    [{ detalle: 'x'.repeat(501) }, 'detalle'],
  ])('ABC-348: rechaza el campo incompatible con el cierre %j', (datos, campo) => {
    const evento = REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO;
    expect(() => validarRegistroContableResultadoV1({ ...evento, data: { ...evento.data, ...datos } }))
      .toThrow(`data.${campo}`);
  });

});
