import { BadRequestException } from '@nestjs/common';
import { EstadoBoleta } from '../entities/estado-boleta.enum';
import { ValidarListarBoletasPipe } from './validar-listar-boletas.pipe';

describe('ABC-258: validación de parámetros de consulta de boletas', () => {
  const pipe = new ValidarListarBoletasPipe();

  it('asigna valores predeterminados cuando no se envían parámetros', () => {
    expect(pipe.transform({})).toEqual({ page: 1, limit: 10 });
    expect(pipe.transform(undefined)).toEqual({ page: 1, limit: 10 });
    expect(pipe.transform(null)).toEqual({ page: 1, limit: 10 });
  });

  it('procesa y normaliza parámetros válidos de paginación y filtros', () => {
    const result = pipe.transform({
      page: '2',
      limit: '20',
      ordenId: '8',
      estado: 'emitida',
      fechaDesde: '2026-10-01',
      fechaHasta: '2026-10-15',
    });

    expect(result).toEqual({
      page: 2,
      limit: 20,
      ordenId: '8',
      estado: EstadoBoleta.EMITIDA,
      fechaDesde: '2026-10-01T00:00:00.000Z',
      fechaHasta: '2026-10-15T23:59:59.999Z',
    });
  });

  it('acepta los tres estados válidos del dominio', () => {
    expect(pipe.transform({ estado: 'BORRADOR' }).estado).toBe(EstadoBoleta.BORRADOR);
    expect(pipe.transform({ estado: 'EMITIDA' }).estado).toBe(EstadoBoleta.EMITIDA);
    expect(pipe.transform({ estado: 'ANULADA' }).estado).toBe(EstadoBoleta.ANULADA);
  });

  it('acepta alias desde, hasta y orden', () => {
    const result = pipe.transform({
      orden: 'ORD-7',
      desde: '2026-10-05',
      hasta: '2026-10-10',
    });
    expect(result).toEqual({
      page: 1,
      limit: 10,
      orden: 'ORD-7',
      fechaDesde: '2026-10-05T00:00:00.000Z',
      fechaHasta: '2026-10-10T23:59:59.999Z',
    });
  });

  it('acepta una fecha válida en año bisiesto', () => {
    const result = pipe.transform({
      fechaDesde: '2024-02-29',
      fechaHasta: '2024-02-29',
    });
    expect(result.fechaDesde).toBe('2024-02-29T00:00:00.000Z');
    expect(result.fechaHasta).toBe('2024-02-29T23:59:59.999Z');
  });

  it.each([
    ['page cero', { page: '0' }],
    ['page negativo', { page: '-1' }],
    ['page no numérico', { page: 'primera' }],
    ['limit cero', { limit: '0' }],
    ['limit negativo', { limit: '-5' }],
    ['limit superior a 100', { limit: '101' }],
    ['limit no numérico', { limit: 'muchos' }],
    ['estado no permitido', { estado: 'CANCELADA' }],
    ['fechaDesde inválida', { fechaDesde: 'ayer' }],
    ['fechaHasta inválida', { fechaHasta: '2026-13-45' }],
    ['fecha febrero imposible (2026-02-31)', { fechaDesde: '2026-02-31' }],
    ['fecha abril imposible (2026-04-31)', { fechaHasta: '2026-04-31' }],
    ['año no bisiesto (2026-02-29)', { fechaDesde: '2026-02-29' }],
    ['hora inválida (2026-10-15T25:00:00Z)', { fechaDesde: '2026-10-15T25:00:00Z' }],
    ['rango invertido (fechaDesde posterior a fechaHasta)', { fechaDesde: '2026-10-20', fechaHasta: '2026-10-10' }],
    ['parámetro no permitido', { parametroInvalido: 'algo' }],
    ['cuerpo no objeto', 'cadena-no-valida'],
  ])('rechaza parámetros inválidos (%s): %j', (_desc, value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
