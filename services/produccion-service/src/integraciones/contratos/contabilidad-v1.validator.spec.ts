import { REGISTRO_CONTABLE_RESULTADO_V1_EJEMPLO } from './contabilidad-v1';
import { EventoContabilidadV1InvalidoError, validarRegistroContableResultadoV1 } from './contabilidad-v1.validator';

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
});
