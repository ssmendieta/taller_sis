import { BadRequestException } from '@nestjs/common';
import { ValidarAnularBoletaPipe } from './validar-anular-boleta.pipe';

describe('ABC-245: validación del motivo de anulación de boleta', () => {
  const pipe = new ValidarAnularBoletaPipe();

  it('acepta un motivo válido y aplica trim', () => {
    const res = pipe.transform({ motivo: '  Error en la asignación de lote  ' });
    expect(res).toEqual({ motivo: 'Error en la asignación de lote' });
  });

  it('rechaza si el cuerpo no es un objeto', () => {
    expect(() => pipe.transform(null)).toThrow(BadRequestException);
    expect(() => pipe.transform('texto')).toThrow(BadRequestException);
    expect(() => pipe.transform([])).toThrow(BadRequestException);
  });

  it('rechaza si el motivo es una cadena vacía', () => {
    expect(() => pipe.transform({ motivo: '' })).toThrow(new BadRequestException('El motivo de anulación es obligatorio y no puede estar vacío'));
  });

  it('rechaza si el motivo contiene únicamente espacios en blanco', () => {
    expect(() => pipe.transform({ motivo: '    ' })).toThrow(new BadRequestException('El motivo de anulación es obligatorio y no puede estar vacío'));
  });

  it('rechaza si el motivo no es de tipo string', () => {
    expect(() => pipe.transform({ motivo: 12345 })).toThrow(BadRequestException);
    expect(() => pipe.transform({ motivo: null })).toThrow(BadRequestException);
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it('rechaza si contiene campos extra no reconocidos', () => {
    expect(() => pipe.transform({ motivo: 'Motivo válido', estado: 'ANULADA' })).toThrow(BadRequestException);
  });

  it('rechaza si el motivo excede los 500 caracteres', () => {
    const largo = 'a'.repeat(501);
    expect(() => pipe.transform({ motivo: largo })).toThrow(BadRequestException);
  });
});
