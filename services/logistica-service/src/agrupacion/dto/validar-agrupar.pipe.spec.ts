import { ValidarAgruparPipe } from './validar-agrupar.pipe';

describe('ABC-362: solicitud de agrupación', () => {
  const pipe = new ValidarAgruparPipe();
  const filas = [
    { solicitudId: '1', fechaRequerida: '2026-11-12', tipoCarga: '  Seca  ' },
    { solicitudId: '2', fechaRequerida: '2026-11-12', tipoCarga: 'Seca' },
  ];

  it('conserva identificadores como strings y normaliza los bordes de tipo', () => {
    expect(pipe.transform({ solicitudes: filas })).toEqual([{ ...filas[0], tipoCarga: 'Seca' }, filas[1]]);
  });

  it.each([
    [filas.slice(0, 1)],
    [[filas[0], filas[0]]],
    [[filas[0], { ...filas[1], fechaRequerida: '2026-02-30' }]],
    [[filas[0], { ...filas[1], unidadCarga: 'kg' }]],
    [[filas[0], { ...filas[1], solicitudId: '9223372036854775808' }]],
  ])('rechaza selecciones inválidas %j', (solicitudes) => {
    expect(() => pipe.transform({ solicitudes })).toThrow();
  });
});
