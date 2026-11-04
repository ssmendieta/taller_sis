import { normalizarUnidad, esUnidadValida, CODIGOS_UNIDADES } from './unidades.catalogo';

describe('catálogo único de unidades', () => {
  it('contiene las 10 unidades iniciales', () => {
    expect(CODIGOS_UNIDADES).toEqual(
      expect.arrayContaining(['kg', 'g', 'l', 'ml', 'm', 'cm', 'unidad', 'docena', 'caja', 'paquete']),
    );
    expect(CODIGOS_UNIDADES).toHaveLength(10);
  });

  it('valida códigos del catálogo', () => {
    expect(esUnidadValida('kg')).toBe(true);
    expect(esUnidadValida('kilos')).toBe(false);
    expect(esUnidadValida('')).toBe(false);
  });

  it.each([
    ['Kg', 'kg'],
    ['kilos', 'kg'],
    ['kilogramos', 'kg'],
    ['und', 'unidad'],
    ['unidades', 'unidad'],
    ['LTS', 'l'],
    ['paquetes', 'paquete'],
  ])('normaliza %s -> %s', (entrada, esperado) => {
    expect(normalizarUnidad(entrada)).toBe(esperado);
  });

  it('devuelve null si no hay mapeo', () => {
    expect(normalizarUnidad('tonelada')).toBeNull();
    expect(normalizarUnidad('')).toBeNull();
  });
});
