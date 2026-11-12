import { ConsumoCierreV1 } from '../contratos/contabilidad-v1';
import { calcularCostoBase, clavePrecio } from './calcular-costo-base';

const consumo = (materialId: string, cantidad: string): ConsumoCierreV1 => ({
  materialId, materialCodigo: `M-${materialId}`, materialNombre: `Material ${materialId}`, cantidad, unidad: 'kg',
});

describe('ABC-345: calcularCostoBase (prueba unitaria, sin BD)', () => {
  it('calcula costo por consumo y total COMPLETO en BOB con 4 decimales', () => {
    const r = calcularCostoBase([consumo('1', '12.5000'), consumo('2', '0.3333')], new Map([[clavePrecio('1', 'kg'), '8.5000'], [clavePrecio('2', 'kg'), '3.0000']]));
    expect(r.consumos[0]).toMatchObject({ estadoCosto: 'CALCULADO', costoUnitario: '8.5000', costoTotal: '106.2500' });
    expect(r.consumos[1].costoTotal).toBe('0.9999');
    expect(r.costoBase).toEqual({ moneda: 'BOB', fuentePrecios: 'CATALOGO_MATERIALES', estado: 'COMPLETO', total: '107.2499' });
  });

  it('deja PENDIENTE el consumo sin precio y no inventa importes', () => {
    const r = calcularCostoBase([consumo('1', '5.0000')], new Map([[clavePrecio('1', 'kg'), null]]));
    expect(r.consumos[0]).toEqual({ ...consumo('1', '5.0000'), estadoCosto: 'PENDIENTE' });
    expect(r.costoBase).toEqual({ moneda: 'BOB', fuentePrecios: 'CATALOGO_MATERIALES', estado: 'PENDIENTE' });
    expect(r.costoBase.total).toBeUndefined();
  });

  it('un material sin precio vuelve PARCIAL el costo y omite el total', () => {
    const r = calcularCostoBase([consumo('1', '2.0000'), consumo('2', '1.0000')], new Map([[clavePrecio('1', 'kg'), '10.0000']]));
    expect(r.consumos.map((c) => c.estadoCosto)).toEqual(['CALCULADO', 'PENDIENTE']);
    expect(r.costoBase.estado).toBe('PARCIAL');
    expect(r.costoBase.total).toBeUndefined();
  });

  it('redondea half-up a 4 decimales sin usar number', () => {
    expect(calcularCostoBase([consumo('1', '0.0001')], new Map([[clavePrecio('1', 'kg'), '0.5000']])).consumos[0].costoTotal).toBe('0.0001');
    expect(calcularCostoBase([consumo('1', '99999999.9999')], new Map([[clavePrecio('1', 'kg'), '99999999.9999']])).consumos[0].costoTotal)
      .toBe('9999999999980000.0000');
  });

  it('cierre sin consumos: COMPLETO con total 0.0000 y entrada sin mutar', () => {
    expect(calcularCostoBase([], new Map()).costoBase).toMatchObject({ estado: 'COMPLETO', total: '0.0000' });
    const original = consumo('1', '1.0000');
    const copia = structuredClone(original);
    calcularCostoBase([original], new Map([[clavePrecio('1', 'kg'), '2.0000']]));
    expect(original).toEqual(copia);
  });
});
