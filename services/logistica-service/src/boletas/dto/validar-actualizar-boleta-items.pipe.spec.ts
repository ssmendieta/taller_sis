import { BadRequestException } from '@nestjs/common';
import { ValidarActualizarBoletaItemsPipe } from './validar-actualizar-boleta-items.pipe';

describe('ABC-220: validación de actualización de ítems de boleta', () => {
  const pipe = new ValidarActualizarBoletaItemsPipe();

  it('normaliza referencias y cantidades a cuatro decimales', () => {
    expect(pipe.transform({ items: [{ referencia: ' LOTE-1 ', cantidad: '8.5' }] }))
      .toEqual({ items: [{ referencia: 'LOTE-1', cantidad: '8.5000' }] });
  });

  it('acepta múltiples ítems válidos', () => {
    expect(pipe.transform({
      items: [
        { referencia: 'L-1', cantidad: '10' },
        { referencia: 'L-2', cantidad: '2.25' },
      ],
    })).toEqual({
      items: [
        { referencia: 'L-1', cantidad: '10.0000' },
        { referencia: 'L-2', cantidad: '2.2500' },
      ],
    });
  });

  it.each([
    ['cuerpo no objeto', 'no-es-objeto'],
    ['cuerpo nulo', null],
    ['cuerpo arreglo', []],
    ['campo extra no permitido', { items: [{ referencia: 'A', cantidad: '1' }], campoExtra: true }],
    ['items no es arreglo', { items: 'invalido' }],
    ['items vacío', { items: [] }],
    ['ítem no es objeto', { items: ['no-objeto'] }],
    ['ítem sin referencia', { items: [{ cantidad: '5' }] }],
    ['ítem sin cantidad', { items: [{ referencia: 'A' }] }],
    ['ítem con campo no permitido', { items: [{ referencia: 'A', cantidad: '1', extra: 123 }] }],
    ['referencia vacía', { items: [{ referencia: '', cantidad: '1' }] }],
    ['referencia solo espacios', { items: [{ referencia: '   ', cantidad: '1' }] }],
    ['referencia mayor a 160 caracteres', { items: [{ referencia: 'A'.repeat(161), cantidad: '1' }] }],
    ['cantidad cero entera', { items: [{ referencia: 'A', cantidad: '0' }] }],
    ['cantidad cero con decimales', { items: [{ referencia: 'A', cantidad: '0.0000' }] }],
    ['cantidad negativa entera', { items: [{ referencia: 'A', cantidad: '-5' }] }],
    ['cantidad negativa decimal', { items: [{ referencia: 'A', cantidad: '-0.5000' }] }],
    ['cantidad no numérica', { items: [{ referencia: 'A', cantidad: 'diez' }] }],
    ['cantidad con más de cuatro decimales', { items: [{ referencia: 'A', cantidad: '1.12345' }] }],
  ])('rechaza datos inválidos (%s): %j', (_descripcion, value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
