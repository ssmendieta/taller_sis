import { ConsumoCierreV1, ConsumoCostoV1, CostoBaseV1 } from '../contratos/contabilidad-v1';

// ABC-345: costo base por orden a partir de los consumos del snapshot y de los
// precios del catalogo de materiales (BOB, 4 decimales). Funcion pura: no modifica
// la entrada y usa enteros escalados (BigInt), nunca number, para los decimales.
const ESCALA = 10000n;
const DECIMAL = /^\d+(?:\.\d{1,4})?$/;

function aUnidades(valor: string): bigint {
  const [entero, fraccion = ''] = valor.split('.');
  return BigInt(entero) * ESCALA + BigInt(fraccion.padEnd(4, '0'));
}

function aTexto(unidades: bigint): string {
  return `${unidades / ESCALA}.${String(unidades % ESCALA).padStart(4, '0')}`;
}

// El precio del catalogo esta expresado en la unidad del material; solo aplica a
// consumos en esa misma unidad (no se convierten unidades: kg vs g queda PENDIENTE).
export const clavePrecio = (materialId: string, unidad: string) => `${materialId}|${unidad}`;

export function calcularCostoBase(
  consumos: ReadonlyArray<ConsumoCierreV1>,
  precios: ReadonlyMap<string, string | null>,
): { consumos: ConsumoCostoV1[]; costoBase: CostoBaseV1 } {
  let calculados = 0;
  let total = 0n;

  const conCosto = consumos.map((consumo): ConsumoCostoV1 => {
    const precio = precios.get(clavePrecio(consumo.materialId, consumo.unidad));
    if (precio == null || !DECIMAL.test(precio) || !DECIMAL.test(consumo.cantidad)) {
      return { ...consumo, estadoCosto: 'PENDIENTE' };
    }
    // cantidad x precio tiene escala 1e8; se redondea half-up a 1e4.
    const costoTotal = (aUnidades(consumo.cantidad) * aUnidades(precio) + ESCALA / 2n) / ESCALA;
    total += costoTotal;
    calculados += 1;
    return {
      ...consumo,
      estadoCosto: 'CALCULADO',
      costoUnitario: aTexto(aUnidades(precio)),
      costoTotal: aTexto(costoTotal),
    };
  });

  const base = { moneda: 'BOB', fuentePrecios: 'CATALOGO_MATERIALES' } as const;
  if (calculados === consumos.length) {
    return { consumos: conCosto, costoBase: { ...base, estado: 'COMPLETO', total: aTexto(total) } };
  }
  return {
    consumos: conCosto,
    costoBase: { ...base, estado: calculados === 0 ? 'PENDIENTE' : 'PARCIAL' },
  };
}
