import { CierreProduccion } from '../../cierre-produccion/entities/cierre-produccion.entity';
import { validarCostoBaseProduccionCerradaV1 } from '../contratos/contabilidad-v1.validator';
import { clavePrecio } from './calcular-costo-base';
import { crearEventoProduccionCerrada } from './crear-evento-produccion-cerrada';

function cierre(): CierreProduccion {
  return {
    id: '7', ordenId: '15', cierreVersion: 1, ordenCodigo: 'ORD-0015',
    producto: { productoId: 3, codigo: 'PAN-001', nombre: 'Pan integral', unidad: 'unidad' },
    cantidadSolicitada: '30.0000', cantidadProducida: '30.0000', cantidadConforme: '30.0000', cantidadDefectuosa: '0.0000',
    consumos: [
      { materialId: '8', materialCodigo: 'HAR-001', materialNombre: 'Harina', cantidad: '12.5000', unidad: 'kg' },
      { materialId: '9', materialCodigo: 'AZU-001', materialNombre: 'Azucar', cantidad: '2.0000', unidad: 'kg' },
    ],
    finalizadaAt: new Date('2026-10-11T17:55:00.000Z'), fechaCierre: new Date('2026-10-11T18:00:00.000Z'),
  } as CierreProduccion;
}

describe('ABC-345: ProduccionCerrada.v1 con costo base (prueba unitaria, sin broker ni BD)', () => {
  it('traza consumos al cierre sin alterar el snapshot y marca PENDIENTE lo que no tiene precio', () => {
    const snapshot = cierre();
    const copia = structuredClone(snapshot);
    const evento = crearEventoProduccionCerrada(snapshot, new Map([[clavePrecio('8', 'kg'), '8.5000'], [clavePrecio('9', 'kg'), null]]));

    expect(snapshot).toEqual(copia);
    expect(evento.data.cierreId).toBe('7');
    expect(evento.data.resumenId).toBe('7');
    expect(evento.data.cierreVersion).toBe(1);
    expect(evento.data.consumos.map(({ materialId, materialCodigo, materialNombre, cantidad, unidad }) => (
      { materialId, materialCodigo, materialNombre, cantidad, unidad }
    ))).toEqual(snapshot.consumos);
    expect(evento.data.consumos[0]).toMatchObject({ estadoCosto: 'CALCULADO', costoTotal: '106.2500' });
    expect(evento.data.consumos[1]).toMatchObject({ estadoCosto: 'PENDIENTE' });
    expect(evento.data.consumos[1].costoTotal).toBeUndefined();
    expect(evento.data.costoBase).toEqual({ moneda: 'BOB', fuentePrecios: 'CATALOGO_MATERIALES', estado: 'PARCIAL' });
    expect(validarCostoBaseProduccionCerradaV1(evento)).toBe(evento);
  });

  it('sin precios disponibles todo el costo queda PENDIENTE', () => {
    const evento = crearEventoProduccionCerrada(cierre());
    expect(evento.data.costoBase?.estado).toBe('PENDIENTE');
    expect(evento.data.consumos.every((c) => c.estadoCosto === 'PENDIENTE' && c.costoTotal === undefined)).toBe(true);
  });
});
