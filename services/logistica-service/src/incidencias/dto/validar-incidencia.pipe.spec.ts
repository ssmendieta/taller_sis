import { ValidarIncidenciaPipe } from './validar-incidencia.pipe';

describe('ABC-381: validación de incidencias', () => {
  const pipe = new ValidarIncidenciaPipe();
  const incidencia = { tipo: 'RETRASO', motivo: '  Bloqueo vial  ' };

  it('acepta la fecha nula que envía la pantalla sin reprogramación', () => {
    expect(pipe.transform({ ...incidencia, nuevaFecha: null })).toEqual({
      tipo: 'RETRASO', motivo: 'Bloqueo vial', paradaId: null, nuevaFecha: undefined,
    });
  });

  it.each([
    { motivo: '  ' },
    { tipo: 'OTRA' },
    { paradaId: '9223372036854775808' },
    { nuevaFecha: '2026-02-30' },
    { registradaPorUsuarioId: '42' },
  ])('rechaza los datos inválidos %j', (cambio) => {
    expect(() => pipe.transform({ ...incidencia, ...cambio })).toThrow();
  });
});
