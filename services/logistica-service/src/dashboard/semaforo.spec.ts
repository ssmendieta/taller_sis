import { calcularSemaforo } from './semaforo';

const UMBRALES = { umbralAmarilloPct: 10, umbralRojoPct: 20 };

describe('calcularSemaforo (ABC-495)', () => {
  describe('MAYOR_ES_MEJOR (meta 95)', () => {
    it.each([
      [96, 'VERDE'],
      [95, 'VERDE'],
      [90, 'VERDE'],
      [85.6, 'VERDE'],
      [85.5, 'AMARILLO'], // d = 10 exacto
      [80, 'AMARILLO'],
      [76.1, 'AMARILLO'],
      [76, 'ROJO'], // d = 20 exacto
      [50, 'ROJO'],
      [0, 'ROJO'],
    ])('valor %p → %s', (valor, color) => {
      expect(calcularSemaforo(valor, 95, UMBRALES, 'MAYOR_ES_MEJOR').color).toBe(color);
    });
  });

  describe('MENOR_ES_MEJOR (meta 48)', () => {
    it.each([
      [10, 'VERDE'],
      [48, 'VERDE'],
      [52.7, 'VERDE'],
      [52.8, 'AMARILLO'], // d = 10 exacto
      [57.5, 'AMARILLO'],
      [57.6, 'ROJO'], // d = 20 exacto
      [100, 'ROJO'],
    ])('valor %p → %s', (valor, color) => {
      expect(calcularSemaforo(valor, 48, UMBRALES, 'MENOR_ES_MEJOR').color).toBe(color);
    });
  });

  it('devuelve la desviación adversa con 2 decimales', () => {
    expect(calcularSemaforo(93.5, 95, UMBRALES, 'MAYOR_ES_MEJOR').desviacionPct).toBe(1.58);
  });

  it('devuelve desviación negativa si el valor es mejor que la meta', () => {
    expect(calcularSemaforo(100, 80, UMBRALES, 'MAYOR_ES_MEJOR').desviacionPct).toBe(-25);
  });

  it('devuelve sin color si el KPI no tiene meta', () => {
    expect(calcularSemaforo(90, null, UMBRALES, 'MAYOR_ES_MEJOR')).toEqual({
      desviacionPct: null,
      color: null,
    });
  });

  it('devuelve sin color si el KPI no tiene valor', () => {
    expect(calcularSemaforo(null, 95, UMBRALES, 'MAYOR_ES_MEJOR').color).toBeNull();
    expect(calcularSemaforo(undefined, 95, UMBRALES, 'MAYOR_ES_MEJOR').color).toBeNull();
    expect(calcularSemaforo(NaN, 95, UMBRALES, 'MAYOR_ES_MEJOR').color).toBeNull();
  });

  it('devuelve sin color si la meta no es positiva', () => {
    expect(calcularSemaforo(5, 0, UMBRALES, 'MENOR_ES_MEJOR').color).toBeNull();
  });
});
