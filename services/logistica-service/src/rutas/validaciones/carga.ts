import { ConflictException } from '@nestjs/common';
import { CapacidadV1, UNIDADES_CAPACIDAD_V1, UnidadCapacidadV1, VehiculoErpV1 } from '../../recursos-externos/dto/recursos-logisticos-v1';
import { compararCapacidad, diezmilesimas } from '../../recursos-externos/dto/recursos-logisticos-v1.validator';

// ABC-371: carga de una ruta y su comparación con la capacidad del vehículo.
// Lógica pura: no consulta la base ni otros servicios.

export interface ItemCarga {
  boletaId: string;
  cantidad: string;
  // Unidad del producto según Producción; null si no se conoce.
  unidad: string | null;
}

function aTexto(total: bigint): string {
  const texto = total.toString().padStart(5, '0');
  return `${texto.slice(0, -4)}.${texto.slice(-4)}`;
}

/**
 * Suma la carga en una sola unidad del contrato de recursos. Rechaza boletas sin
 * ítems, unidades desconocidas y mezclas de unidades (no se convierten).
 */
export function calcularCarga(boletaIds: string[], items: ItemCarga[]): CapacidadV1 {
  const sinItems = boletaIds.filter((id) => !items.some((item) => item.boletaId === id));
  if (sinItems.length > 0) {
    throw new ConflictException(`Carga desconocida: las boletas ${sinItems.join(', ')} no tienen ítems`);
  }
  const sinUnidad = [...new Set(items.filter((item) => !item.unidad?.trim()).map((item) => item.boletaId))];
  if (sinUnidad.length > 0) {
    throw new ConflictException(`Carga desconocida: no se conoce la unidad de las boletas ${sinUnidad.join(', ')}`);
  }
  const unidades = [...new Set(items.map((item) => item.unidad!.trim()))];
  const desconocidas = unidades.filter((unidad) => !(UNIDADES_CAPACIDAD_V1 as readonly string[]).includes(unidad));
  if (desconocidas.length > 0) {
    throw new ConflictException(
      `Unidad de carga desconocida: ${desconocidas.join(', ')}. Se admiten ${UNIDADES_CAPACIDAD_V1.join(', ')}`,
    );
  }
  if (unidades.length > 1) {
    throw new ConflictException(`La carga mezcla unidades (${unidades.join(', ')}) y no se convierten entre sí`);
  }
  const total = items.reduce((suma, item) => suma + diezmilesimas(item.cantidad), BigInt(0));
  return { valor: aTexto(total), unidad: unidades[0] as UnidadCapacidadV1 };
}

/** Rechaza la sobrecarga y la capacidad expresada en otra unidad. */
export function validarCapacidad(vehiculo: VehiculoErpV1, carga: CapacidadV1): void {
  const resultado = compararCapacidad(vehiculo.capacidad, carga);
  if (resultado === 'UNIDAD_INCOMPATIBLE') {
    throw new ConflictException(
      `La capacidad del vehículo ${vehiculo.idExterno} está en ${vehiculo.capacidad.unidad} y la carga en ${carga.unidad}; no se convierten`,
    );
  }
  if (resultado === 'INSUFICIENTE') {
    throw new ConflictException(
      `Sobrecarga: la carga de ${carga.valor} ${carga.unidad} supera la capacidad del vehículo ${vehiculo.idExterno} (${vehiculo.capacidad.valor} ${vehiculo.capacidad.unidad})`,
    );
  }
}
