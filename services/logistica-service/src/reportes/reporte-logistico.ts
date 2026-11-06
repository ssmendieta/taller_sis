import { EstadoBoleta } from '../boletas/entities/estado-boleta.enum';
import { EstadoEntrega } from '../despacho/estado-entrega.enum';
import { TipoIncidencia } from '../incidencias/entities/tipo-incidencia.enum';
import { diezmilesimas } from '../recursos-externos/dto/recursos-logisticos-v1.validator';
import { EstadoRuta } from '../rutas/entities/estado-ruta.enum';
import { formatearDiezmilesimas } from '../rutas/validaciones/carga';
import { BoletaReporte, ReporteLogistico, ReporteLogisticoQuery, RutaReporte } from './dto/reporte-logistico.dto';

// ABC-340: filas tal como salen de consultas de una sola tabla o de uniones 1:1.
// Los totales se calculan aquí con conjuntos de ids, así ninguna unión con
// ítems, boletas o incidencias puede multiplicarlos (CA-03).
export interface DatosReporte {
  rutas: Array<{ id: string; fecha_programada: string; estado: EstadoRuta; vehiculo_externo_id: string; chofer_externo_id: string }>;
  paradas: Array<{ id: string; ruta_id: string; estado_entrega: EstadoEntrega }>;
  documentosRuta: Array<{ parada_id: string; boleta_id: string; estado: EstadoBoleta }>;
  incidencias: Array<{ ruta_id: string; tipo: TipoIncidencia; total: number }>;
  reprogramaciones: Array<{ ruta_id: string; total: number }>;
  boletas: Array<{ id: string; numero: string; fecha: string; estado: EstadoBoleta; orden_id: string }>;
  itemsBoleta: Array<{ boleta_id: string; items: number; cantidad: string }>;
  ubicacionBoletas: Array<{ boleta_id: string; ruta_id: string; estado_ruta: EstadoRuta; estado_entrega: EstadoEntrega }>;
  unidades: Map<string, string | null>;
}

const contar = <T extends string>(valores: readonly T[], claves: readonly T[]) =>
  Object.fromEntries(claves.map((clave) => [clave, valores.filter((valor) => valor === clave).length])) as Record<T, number>;

// Entregada = está en una parada ENTREGADA de una ruta no cancelada y la boleta sigue EMITIDA (CA-02).
const entregada = (estadoBoleta: EstadoBoleta, estadoEntrega: EstadoEntrega, estadoRuta: EstadoRuta) =>
  estadoBoleta === EstadoBoleta.EMITIDA && estadoEntrega === EstadoEntrega.ENTREGADA && estadoRuta !== EstadoRuta.CANCELADA;

export function armarReporte(filtros: ReporteLogisticoQuery, datos: DatosReporte, generadoEn: Date, avisos: string[] = []): ReporteLogistico {
  const paradasPorRuta = new Map<string, DatosReporte['paradas']>();
  for (const parada of datos.paradas) paradasPorRuta.set(parada.ruta_id, [...(paradasPorRuta.get(parada.ruta_id) ?? []), parada]);
  const documentosPorParada = new Map<string, DatosReporte['documentosRuta']>();
  for (const documento of datos.documentosRuta) {
    documentosPorParada.set(documento.parada_id, [...(documentosPorParada.get(documento.parada_id) ?? []), documento]);
  }
  const totalPorRuta = (filas: Array<{ ruta_id: string; total: number }>, rutaId: string) =>
    filas.filter((fila) => fila.ruta_id === rutaId).reduce((suma, fila) => suma + Number(fila.total), 0);

  const entregadasEnRutas = new Set<string>();
  const rutas: RutaReporte[] = datos.rutas.map((ruta) => {
    const paradas = paradasPorRuta.get(ruta.id) ?? [];
    const estadoBoleta = new Map<string, EstadoBoleta>();
    const entregadas = new Set<string>();
    for (const parada of paradas) {
      for (const documento of documentosPorParada.get(parada.id) ?? []) {
        estadoBoleta.set(documento.boleta_id, documento.estado);
        if (entregada(documento.estado, parada.estado_entrega, ruta.estado)) entregadas.add(documento.boleta_id);
      }
    }
    entregadas.forEach((id) => entregadasEnRutas.add(id));
    const estados = [...estadoBoleta.values()];
    const entregas = paradas.map((parada) => parada.estado_entrega);
    return {
      id: ruta.id,
      fechaProgramada: ruta.fecha_programada,
      estado: ruta.estado,
      vehiculoExternoId: ruta.vehiculo_externo_id,
      choferExternoId: ruta.chofer_externo_id,
      paradas: {
        total: paradas.length,
        entregadas: entregas.filter((estado) => estado === EstadoEntrega.ENTREGADA).length,
        pendientes: entregas.filter((estado) => estado === EstadoEntrega.PENDIENTE).length,
        anuladas: entregas.filter((estado) => estado === EstadoEntrega.ANULADA).length,
      },
      boletas: {
        total: estadoBoleta.size,
        emitidas: estados.filter((estado) => estado === EstadoBoleta.EMITIDA).length,
        anuladas: estados.filter((estado) => estado === EstadoBoleta.ANULADA).length,
        entregadas: entregadas.size,
      },
      incidencias: totalPorRuta(datos.incidencias, ruta.id),
      reprogramaciones: totalPorRuta(datos.reprogramaciones, ruta.id),
    };
  });

  const vigentes = rutas.filter((ruta) => ruta.estado !== EstadoRuta.CANCELADA);
  const sumar = (seleccion: (ruta: RutaReporte) => number) => vigentes.reduce((suma, ruta) => suma + seleccion(ruta), 0);

  const items = new Map(datos.itemsBoleta.map((fila) => [fila.boleta_id, fila]));
  const boletas: BoletaReporte[] = datos.boletas.map((boleta) => {
    // Si una boleta pasó por varias rutas, se muestra la vigente más reciente.
    const ubicaciones = datos.ubicacionBoletas
      .filter((fila) => fila.boleta_id === boleta.id)
      .sort((a, b) => Number(a.estado_ruta === EstadoRuta.CANCELADA) - Number(b.estado_ruta === EstadoRuta.CANCELADA) ||
        Number(BigInt(b.ruta_id) - BigInt(a.ruta_id)));
    const ubicacion = ubicaciones[0];
    return {
      id: boleta.id,
      numero: boleta.numero,
      fecha: boleta.fecha,
      estado: boleta.estado,
      ordenId: boleta.orden_id,
      items: Number(items.get(boleta.id)?.items ?? 0),
      cantidadTotal: formatearDiezmilesimas(diezmilesimas(items.get(boleta.id)?.cantidad ?? '0')),
      unidad: datos.unidades.get(boleta.orden_id) ?? null,
      rutaId: ubicacion?.ruta_id ?? null,
      estadoRuta: ubicacion?.estado_ruta ?? null,
      entregada: ubicaciones.some((fila) => entregada(boleta.estado, fila.estado_entrega, fila.estado_ruta)),
    };
  });

  const cantidadPorUnidad = new Map<string, bigint>();
  for (const boleta of boletas.filter((fila) => fila.estado === EstadoBoleta.EMITIDA)) {
    const unidad = boleta.unidad ?? 'desconocida';
    cantidadPorUnidad.set(unidad, (cantidadPorUnidad.get(unidad) ?? BigInt(0)) + diezmilesimas(boleta.cantidadTotal));
  }

  const porTipo = Object.fromEntries(Object.values(TipoIncidencia).map((tipo) => [
    tipo, datos.incidencias.filter((fila) => fila.tipo === tipo).reduce((suma, fila) => suma + Number(fila.total), 0),
  ])) as Record<TipoIncidencia, number>;

  return {
    filtros,
    generadoEn: generadoEn.toISOString(),
    resumen: {
      rutas: { total: rutas.length, porEstado: contar(rutas.map((ruta) => ruta.estado), Object.values(EstadoRuta)) },
      entregas: {
        paradas: sumar((ruta) => ruta.paradas.total),
        entregadas: sumar((ruta) => ruta.paradas.entregadas),
        pendientes: sumar((ruta) => ruta.paradas.pendientes),
        anuladas: sumar((ruta) => ruta.paradas.anuladas),
        boletasEntregadas: entregadasEnRutas.size,
      },
      incidencias: { total: Object.values(porTipo).reduce((suma, total) => suma + total, 0), porTipo },
      reprogramaciones: rutas.reduce((suma, ruta) => suma + ruta.reprogramaciones, 0),
      boletas: {
        total: boletas.length,
        porEstado: contar(boletas.map((boleta) => boleta.estado), Object.values(EstadoBoleta)),
        entregadas: boletas.filter((boleta) => boleta.entregada).length,
        cantidadEmitidaPorUnidad: Object.fromEntries([...cantidadPorUnidad].sort(([a], [b]) => a.localeCompare(b))
          .map(([unidad, total]) => [unidad, formatearDiezmilesimas(total)])),
      },
    },
    rutas,
    boletas,
    avisos,
  };
}
