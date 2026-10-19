import { BadRequestException } from '@nestjs/common';
import { ValidarTrazabilidadQueryPipe } from './dto/validar-trazabilidad-query.pipe';

describe('ValidarTrazabilidadQueryPipe', () => {
  let pipe: ValidarTrazabilidadQueryPipe;

  beforeEach(() => {
    pipe = new ValidarTrazabilidadQueryPipe();
  });

  it('retorna objeto vacío cuando el valor es undefined o null', () => {
    expect(pipe.transform(undefined)).toEqual({});
    expect(pipe.transform(null)).toEqual({});
  });

  it('rechaza valores que no sean objetos', () => {
    expect(() => pipe.transform('texto')).toThrow(BadRequestException);
    expect(() => pipe.transform(123)).toThrow(BadRequestException);
    expect(() => pipe.transform([])).toThrow(BadRequestException);
  });

  it('rechaza parámetros de consulta no permitidos', () => {
    expect(() => pipe.transform({ desconocido: 'valor' })).toThrow(
      new BadRequestException('Parámetro de consulta no permitido: desconocido'),
    );
  });

  it('permite y sanea parámetros válidos', () => {
    const input = {
      ordenId: '  8  ',
      loteId: '  L-7  ',
      boletaId: '  15  ',
      q: '  BOL-2026  ',
    };

    const output = pipe.transform(input);

    expect(output).toEqual({
      ordenId: '8',
      loteId: 'L-7',
      boletaId: '15',
      q: 'BOL-2026',
    });
  });

  it('ignora campos que quedan vacíos tras recortar espacios', () => {
    const input = {
      ordenId: '   ',
      loteId: '   ',
      boletaId: '   ',
      q: '   ',
    };

    expect(pipe.transform(input)).toEqual({});
  });

  it('valida que boletaId sea un número entero positivo de 64 bits', () => {
    expect(() => pipe.transform({ boletaId: '-1' })).toThrow(
      new BadRequestException('El identificador de boleta debe ser un número entero positivo válido'),
    );
    expect(() => pipe.transform({ boletaId: '0' })).toThrow(
      new BadRequestException('El identificador de boleta debe ser un número entero positivo válido'),
    );
    expect(() => pipe.transform({ boletaId: 'abc' })).toThrow(
      new BadRequestException('El identificador de boleta debe ser un número entero positivo válido'),
    );
    expect(() => pipe.transform({ boletaId: '12.34' })).toThrow(
      new BadRequestException('El identificador de boleta debe ser un número entero positivo válido'),
    );
    expect(() => pipe.transform({ boletaId: '9223372036854775808' })).toThrow(
      new BadRequestException('El identificador de boleta debe ser un número entero positivo válido'),
    );
  });

  it('rechaza parámetros que superen la longitud máxima permitida', () => {
    expect(() => pipe.transform({ ordenId: 'a'.repeat(101) })).toThrow(
      new BadRequestException('El identificador de orden no puede superar los 100 caracteres'),
    );
    expect(() => pipe.transform({ loteId: 'b'.repeat(161) })).toThrow(
      new BadRequestException('El código de lote no puede superar los 160 caracteres'),
    );
    expect(() => pipe.transform({ q: 'c'.repeat(201) })).toThrow(
      new BadRequestException('El término de búsqueda no puede superar los 200 caracteres'),
    );
  });
});
