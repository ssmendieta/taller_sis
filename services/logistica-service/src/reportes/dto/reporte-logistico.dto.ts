import { EstadoBoleta } from '../../boletas/entities/estado-boleta.enum';
import { TipoIncidencia } from '../../incidencias/entities/tipo-incidencia.enum';
import { EstadoRuta } from '../../rutas/entities/estado-ruta.enum';

// ABC-340: filtros del reporte logístico. Los mismos sirven para la vista previa
// y para los archivos PDF/Excel (CA-01).
export interface ReporteLogisticoQuery {
  // Rutas por fecha programada y boletas por fecha de creación (America/La_Paz).
  fechaDesde: string;
  fechaHasta: string;
  estadoRuta: EstadoRuta | null;
  estadoBoleta: EstadoBoleta | null;
}

export interface RutaReporte {
  id: string;
  fechaProgramada: string;
  estado: EstadoRuta;
  vehiculoExternoId: string;
  choferExternoId: string;
  paradas: { total: number; entregadas: number; pendientes: number; anuladas: number };
  // Boletas distintas de la ruta; `entregadas` solo cuenta las que siguen EMITIDA.
  boletas: { total: number; emitidas: number; anuladas: number; entregadas: number };
  incidencias: number;
  reprogramaciones: number;
}

export interface BoletaReporte {
  id: string;
  numero: string;
  fecha: string;
  estado: EstadoBoleta;
  ordenId: string;
  items: number;
  cantidadTotal: string;
  // Unidad del producto según Producción; null si no se conoce.
  unidad: string | null;
  rutaId: string | null;
  estadoRuta: EstadoRuta | null;
  entregada: boolean;
}

export interface ReporteLogistico {
  filtros: ReporteLogisticoQuery;
  generadoEn: string;
  resumen: {
    rutas: { total: number; porEstado: Record<EstadoRuta, number> };
    // Sin rutas CANCELADA: sus paradas no son entregas pendientes.
    entregas: { paradas: number; entregadas: number; pendientes: number; anuladas: number; boletasEntregadas: number };
    incidencias: { total: number; porTipo: Record<TipoIncidencia, number> };
    reprogramaciones: number;
    boletas: {
      total: number;
      porEstado: Record<EstadoBoleta, number>;
      entregadas: number;
      // Solo boletas EMITIDA, sumadas por unidad sin convertir; "desconocida" si falta.
      cantidadEmitidaPorUnidad: Record<string, string>;
    };
  };
  rutas: RutaReporte[];
  boletas: BoletaReporte[];
  avisos: string[];
}
