import { ConflictException } from '@nestjs/common';
import { CapacidadV1 } from '../recursos-externos/dto/recursos-logisticos-v1';
import { compararCapacidad, diezmilesimas } from '../recursos-externos/dto/recursos-logisticos-v1.validator';
import { calcularCarga, ItemCarga } from '../rutas/validaciones/carga';
import type { UsoCapacidadResponse, UsoCapacidadRuta, UsoCapacidadVehiculo } from './dashboard.interface';

// ABC-490: uso de capacidad = carga de la ruta / capacidad del vehículo.
// Lógica pura: no consulta la base. Nunca convierte ni estima unidades.

/** Una fila por ítem de carga; la ruta sin boletas o la boleta sin ítems traen nulos. */
export interface FilaUsoCapacidad {
  ruta_id: string;
  fecha: string;
  estado: string;
  vehiculo_externo_id: string;
  /** ABC-520: chofer de la ruta, para agrupar el ranking. */
  chofer_externo_id?: string;
  placa: string | null;
  capacidad_valor: string | null;
  capacidad_unidad: string | null;
  boleta_id: string | null;
  unidad: string | null;
  cantidad: string | null;
}

// Media simple con 2 decimales; null = sin datos.
function promedio(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;
}

function evaluarRuta(filas: FilaUsoCapacidad[]): UsoCapacidadRuta {
  const [f] = filas;
  const base = {
    ruta_id: f.ruta_id,
    fecha: f.fecha,
    estado: f.estado,
    vehiculo_externo_id: f.vehiculo_externo_id,
    ...(f.chofer_externo_id !== undefined ? { chofer_externo_id: f.chofer_externo_id } : {}),
    placa: f.placa,
  };
  const capacidad = f.capacidad_valor !== null && f.capacidad_unidad !== null && diezmilesimas(f.capacidad_valor) > BigInt(0)
    ? ({ valor: f.capacidad_valor, unidad: f.capacidad_unidad } as CapacidadV1)
    : null;
  const noCalculable = (motivo: UsoCapacidadRuta['motivo'], detalle: string, carga: CapacidadV1 | null): UsoCapacidadRuta =>
    ({ ...base, carga, capacidad, calculable: false, porcentaje: null, motivo, detalle });

  const boletaIds = [...new Set(filas.flatMap((x) => (x.boleta_id === null ? [] : [x.boleta_id])))];
  if (boletaIds.length === 0) return noCalculable('CARGA_NO_CALCULABLE', 'La ruta no tiene boletas', null);

  let carga: CapacidadV1;
  try {
    carga = calcularCarga(boletaIds, filas.flatMap<ItemCarga>((x) => (
      x.boleta_id === null || x.cantidad === null ? [] : [{ boletaId: x.boleta_id, cantidad: x.cantidad, unidad: x.unidad }]
    )));
  } catch (error) {
    if (!(error instanceof ConflictException)) throw error;
    return noCalculable('CARGA_NO_CALCULABLE', error.message, null);
  }
  if (!capacidad) {
    return noCalculable('CAPACIDAD_FALTANTE', `No hay capacidad registrada del vehículo ${f.vehiculo_externo_id} para ${f.fecha}`, carga);
  }
  if (compararCapacidad(capacidad, carga) === 'UNIDAD_INCOMPATIBLE') {
    return noCalculable('UNIDAD_INCOMPATIBLE', `La carga está en ${carga.unidad} y la capacidad en ${capacidad.unidad}; no se convierten`, carga);
  }
  const porcentaje = Math.round((Number(diezmilesimas(carga.valor)) * 10000) / Number(diezmilesimas(capacidad.valor))) / 100;
  return { ...base, carga, capacidad, calculable: true, porcentaje, motivo: null, detalle: null };
}

/**
 * El porcentaje por vehículo y el general son la media simple de los porcentajes de
 * sus rutas calculables: así no se suman entre sí capacidades de distinta unidad.
 */
export function calcularUsoCapacidad(filas: FilaUsoCapacidad[]): UsoCapacidadResponse {
  const porRuta = new Map<string, FilaUsoCapacidad[]>();
  for (const fila of filas) porRuta.set(fila.ruta_id, [...(porRuta.get(fila.ruta_id) ?? []), fila]);
  const rutas = [...porRuta.values()].map(evaluarRuta);

  const porVehiculo = new Map<string, UsoCapacidadRuta[]>();
  for (const ruta of rutas) {
    porVehiculo.set(ruta.vehiculo_externo_id, [...(porVehiculo.get(ruta.vehiculo_externo_id) ?? []), ruta]);
  }
  const resumir = (lista: UsoCapacidadRuta[]) => {
    const porcentajes = lista.flatMap((r) => (r.porcentaje === null ? [] : [r.porcentaje]));
    return {
      porcentaje: promedio(porcentajes),
      rutas_calculables: porcentajes.length,
      rutas_no_calculables: lista.length - porcentajes.length,
    };
  };
  const vehiculos: UsoCapacidadVehiculo[] = [...porVehiculo].map(([id, lista]) => ({
    vehiculo_externo_id: id,
    placa: lista.find((r) => r.placa !== null)?.placa ?? null,
    ...resumir(lista),
  }));
  return { ...resumir(rutas), por_vehiculo: vehiculos, por_ruta: rutas };
}
