import { ReporteLogistico } from '../dto/reporte-logistico.dto';

export type CeldaReporte = string | number;
export interface SeccionReporte {
  titulo: string;
  columnas: Array<{ titulo: string; peso: number }>;
  filas: CeldaReporte[][];
}

const horaBolivia = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium', timeStyle: 'short' });

export function datosExportacion(reporte: ReporteLogistico): SeccionReporte[] {
  const { filtros, resumen } = reporte;
  return [
    {
      titulo: 'Resumen',
      columnas: [{ titulo: 'Indicador', peso: 4 }, { titulo: 'Valor', peso: 6 }],
      filas: [
        ['Desde', filtros.fechaDesde], ['Hasta', filtros.fechaHasta],
        ['Estado de ruta', filtros.estadoRuta ?? 'Todos'], ['Estado de boleta', filtros.estadoBoleta ?? 'Todos'],
        ['Generado en Bolivia', horaBolivia.format(new Date(reporte.generadoEn))],
        ['Rutas', resumen.rutas.total],
        ...Object.entries(resumen.rutas.porEstado).map(([estado, total]) => [`Rutas ${estado}`, total]),
        ['Paradas en rutas no canceladas', resumen.entregas.paradas], ['Paradas entregadas', resumen.entregas.entregadas],
        ['Paradas pendientes', resumen.entregas.pendientes], ['Paradas anuladas', resumen.entregas.anuladas],
        ['Boletas entregadas en las rutas consultadas', resumen.entregas.boletasEntregadas],
        ['Incidencias', resumen.incidencias.total],
        ...Object.entries(resumen.incidencias.porTipo).map(([tipo, total]) => [`Incidencias ${tipo.replace(/_/g, ' ')}`, total]),
        ['Reprogramaciones', resumen.reprogramaciones], ['Boletas del período', resumen.boletas.total],
        ...Object.entries(resumen.boletas.porEstado).map(([estado, total]) => [`Boletas ${estado}`, total]),
        ['Boletas entregadas del período', resumen.boletas.entregadas],
        ...Object.entries(resumen.boletas.cantidadEmitidaPorUnidad).map(([unidad, total]) => [`Cantidad emitida (${unidad})`, total]),
        ...reporte.avisos.map((aviso) => ['Aviso', aviso]),
      ],
    },
    {
      titulo: 'Rutas',
      columnas: [
        { titulo: 'Ruta', peso: 5 }, { titulo: 'Fecha programada', peso: 9 }, { titulo: 'Estado', peso: 9 },
        { titulo: 'Vehículo', peso: 10 }, { titulo: 'Chofer', peso: 10 }, { titulo: 'Paradas', peso: 15 },
        { titulo: 'Boletas', peso: 15 }, { titulo: 'Incidencias', peso: 8 }, { titulo: 'Reprogramaciones', peso: 10 },
      ],
      filas: reporte.rutas.map((r) => [
        r.id, r.fechaProgramada, r.estado, r.vehiculoExternoId ?? '', r.choferExternoId ?? '',
        `${r.paradas.total} total\n${r.paradas.entregadas} entregadas\n${r.paradas.pendientes} pendientes\n${r.paradas.anuladas} anuladas`,
        `${r.boletas.total} total\n${r.boletas.emitidas} emitidas\n${r.boletas.anuladas} anuladas\n${r.boletas.entregadas} entregadas`,
        r.incidencias, r.reprogramaciones,
      ]),
    },
    {
      titulo: 'Boletas',
      columnas: [
        { titulo: 'Boleta', peso: 13 }, { titulo: 'Fecha de creación', peso: 12 }, { titulo: 'Estado', peso: 10 },
        { titulo: 'Orden', peso: 9 }, { titulo: 'Ítems', peso: 5 }, { titulo: 'Cantidad', peso: 12 },
        { titulo: 'Unidad', peso: 10 }, { titulo: 'Ruta', peso: 14 }, { titulo: 'Entregada', peso: 8 },
      ],
      filas: reporte.boletas.map((b) => [
        b.numero, b.fecha, b.estado, b.ordenId, b.items, b.cantidadTotal, b.unidad ?? 'Desconocida',
        b.rutaId ? `${b.rutaId} · ${b.estadoRuta}` : 'Sin ruta', b.entregada ? 'Sí' : 'No',
      ]),
    },
  ];
}
