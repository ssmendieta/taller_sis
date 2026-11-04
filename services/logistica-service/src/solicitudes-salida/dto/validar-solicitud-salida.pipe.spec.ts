import { BadRequestException } from '@nestjs/common';
import { ValidarSolicitudSalidaPipe } from './validar-solicitud-salida.pipe';

describe('ValidarSolicitudSalidaPipe', () => {
  const pipe = new ValidarSolicitudSalidaPipe();
  const body = () => ({
    ordenId: '9007199254740993',
    destinoDocumental: '  Archivo central  ',
    motivo: '  Solicitud documental  ',
    items: [{ referencia: '  LOTE-1 ', cantidad: '1.2301' }],
  });

  it('normaliza textos y conserva precisión de BIGINT y NUMERIC', () => {
    expect(pipe.transform(body())).toEqual({
      ordenId: '9007199254740993',
      destinoDocumental: 'Archivo central',
      motivo: 'Solicitud documental',
      items: [{ referencia: 'LOTE-1', cantidad: '1.2301' }],
    });
  });

  it.each([
    ['destino vacío', (value: any) => { value.destinoDocumental = ' \t '; }],
    ['sin ítems', (value: any) => { value.items = []; }],
    ['cantidad cero', (value: any) => { value.items[0].cantidad = '0.0000'; }],
    ['cantidad negativa', (value: any) => { value.items[0].cantidad = '-1'; }],
    ['referencia vacía', (value: any) => { value.items[0].referencia = ' '; }],
    ['estado enviado por cliente', (value: any) => { value.estado = 'PREPARADA'; }],
    ['responsable enviado por cliente', (value: any) => { value.responsableUsuarioId = '4'; }],
    ['orden fuera de rango', (value: any) => { value.ordenId = '9223372036854775808'; }],
  ])('rechaza %s', (_label, mutate) => {
    const input = body();
    mutate(input);
    expect(() => pipe.transform(input)).toThrow(BadRequestException);
  });
});
