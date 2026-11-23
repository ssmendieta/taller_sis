import { obtenerDetalleKpiProduccion, obtenerKpisProduccion } from "./dashboardService.js";
import { obtenerDetalleKpiLogistica, obtenerKpisLogistica } from "./dashboardLogisticaService.js";
import { PERMISO_CONSULTAR_RUTAS } from "./historialLogisticoService.js";

export const NOMBRES_KPI = {
  CUMPLIMIENTO_FECHA: "Cumplimiento de fecha",
  TIEMPO_CICLO: "Tiempo de ciclo",
  FPY: "Conformes a la primera (FPY)",
  MERMA: "Merma de materia prima",
  TIEMPO_ATENCION: "Tiempo de atención",
  ENTREGAS_A_TIEMPO: "Entregas a tiempo",
  INCIDENCIAS_RUTA: "Incidencias por ruta",
  USO_CAPACIDAD: "Uso de capacidad",
};

// Cada área consulta su propio servicio; los componentes de KPI son los mismos.
export const AREAS_KPI = {
  produccion: {
    permiso: "ordenes.consultar",
    tablero: "/produccion/dashboard",
    listar: obtenerKpisProduccion,
    detalle: obtenerDetalleKpiProduccion,
  },
  logistica: {
    permiso: PERMISO_CONSULTAR_RUTAS,
    tablero: "/logistica/dashboard",
    listar: obtenerKpisLogistica,
    detalle: obtenerDetalleKpiLogistica,
  },
};

const formato = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });

export function formatearKpi(valor, unidad) {
  if (valor === null || valor === undefined) return "Sin datos";
  return unidad === "%" ? `${formato.format(valor)}%` : `${formato.format(valor)} ${unidad ?? ""}`.trim();
}

export function mensajeErrorKpi(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar los KPIs.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudieron cargar los KPIs.";
}
