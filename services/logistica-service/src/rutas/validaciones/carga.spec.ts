import { ConflictException } from '@nestjs/common';
import { VehiculoErpV1 } from '../../recursos-externos/dto/recursos-logisticos-v1';
import { calcularCarga, validarCapacidad } from './carga';
import { clavesBloqueo } from './validacion-asignacion.service';

const vehiculo = (valor: string, unidad: 'kg' | 'l' = 'kg'): VehiculoErpV1 => ({
  idExterno: 'VEH-01', placa: '2345-ABC', descripcion: null, capacidad: { valor, unidad }, disponible: true,
});
const item = (boletaId: string, cantidad: string, unidad: string | null = 'kg') => ({ boletaId, cantidad, unidad });

function rechazo(accion: () => unknown, mensaje: string) {
  expect(accion).toThrow(ConflictException);
  expect(accion).toThrow(mensaje);
}

describe('ABC-371: carga de la ruta y capacidad del vehículo', () => {
  it('suma la carga de todas las boletas con 4 decimales exactos', () => {
    expect(calcularCarga(['1', '2'], [item('1', '10.5000'), item('1', '0.2500'), item('2', '1189.2500')]))
      .toEqual({ valor: '1200.0000', unidad: 'kg' });
    expect(calcularCarga(['1'], [item('1', '0.0001')])).toEqual({ valor: '0.0001', unidad: 'kg' });
  });

  it('acepta la carga igual a la capacidad y rechaza 0.0001 de más (sobrecarga)', () => {
    expect(() => validarCapacidad(vehiculo('1500.0000'), { valor: '1500.0000', unidad: 'kg' })).not.toThrow();
    rechazo(() => validarCapacidad(vehiculo('1500.0000'), { valor: '1500.0001', unidad: 'kg' }),
      'Sobrecarga: la carga de 1500.0001 kg supera la capacidad del vehículo VEH-01 (1500.0000 kg)');
  });

  it('no convierte unidades entre la carga y la capacidad', () => {
    rechazo(() => validarCapacidad(vehiculo('5000', 'l'), { valor: '10.0000', unidad: 'kg' }),
      'La capacidad del vehículo VEH-01 está en l y la carga en kg; no se convierten');
  });

  it.each([
    ['boleta sin ítems', ['1', '2'], [item('1', '5')], 'Carga desconocida: las boletas 2 no tienen ítems'],
    ['unidad desconocida en Producción', ['1', '2'], [item('1', '5'), item('2', '3', null)], 'Carga desconocida: no se conoce la unidad de las boletas 2'],
    ['unidad fuera del contrato', ['1'], [item('1', '5', 'g')], 'Unidad de carga desconocida: g'],
    ['unidades mezcladas', ['1', '2'], [item('1', '5', 'kg'), item('2', '3', 'caja')], 'La carga mezcla unidades (kg, caja)'],
  ])('rechaza %s', (_caso, boletas, items, mensaje) => {
    rechazo(() => calcularCarga(boletas as string[], items as ReturnType<typeof item>[]), mensaje as string);
  });

  it('bloquea vehículo y chofer del día en un orden fijo', () => {
    expect(clavesBloqueo({ fechaProgramada: '2026-11-10', vehiculoExternoId: 'VEH-01', choferExternoId: 'CHO-12' })).toEqual([
      'rutas:chofer:2026-11-10:CHO-12',
      'rutas:vehiculo:2026-11-10:VEH-01',
    ]);
  });
});
