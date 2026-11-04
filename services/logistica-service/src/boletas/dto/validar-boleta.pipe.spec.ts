import { BadRequestException } from '@nestjs/common';
import { ValidarBoletaPipe } from './validar-boleta.pipe';

describe('ABC-213: validación de boletas', () => {
  const pipe = new ValidarBoletaPipe();
  it('normaliza referencias y cantidades', () => {
    expect(pipe.transform({ solicitudSalidaId: '7', items: [{ referencia: ' A ', cantidad: '2.5' }] }))
      .toEqual({ solicitudSalidaId: '7', items: [{ referencia: 'A', cantidad: '2.5000' }] });
  });
  it.each([
    { solicitudSalidaId: '7', items: [] },
    { solicitudSalidaId: '7', items: [{ referencia: 'A', cantidad: '0' }] },
    { solicitudSalidaId: '0', items: [{ referencia: 'A', cantidad: '1' }] },
  ])('rechaza datos inválidos: %j', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
