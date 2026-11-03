import { apiConfig } from "./api.js";

export const PERMISO_CONSULTAR_RUTAS = "logistica.rutas.consultar";

export const ESTADOS_RUTA = {
  PLANIFICADA: { texto: "Planificada", clase: "ts-badge--PLANIFICADA" },
  DESPACHADA: { texto: "Despachada", clase: "ts-badge--EN_PRODUCCION" },
  COMPLETADA: { texto: "Completada", clase: "ts-badge--FINALIZADA" },
  CANCELADA: { texto: "Cancelada", clase: "ts-badge--CANCELADA" },
};

function encabezados() {
  const token =
    sessionStorage.getItem("accessToken") ||
    localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function leer(response, mensaje) {
  if (!response.ok) {
    const datos = await response.json().catch(() => null);
    const detalle = datos?.message;
    const error = new Error((Array.isArray(detalle) ? detalle.join(". ") : detalle) || mensaje);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

const BASE = `${apiConfig.gatewayUrl}/api/logistica`;

// Solo se envían los filtros con valor; page y limit siempre van para paginar en el servidor.
export async function listarHistorialRutas({ fechaDesde, fechaHasta, estado, chofer, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (fechaDesde) params.set("fechaDesde", fechaDesde);
  if (fechaHasta) params.set("fechaHasta", fechaHasta);
  if (estado) params.set("estado", estado);
  if (chofer?.trim()) params.set("chofer", chofer.trim());
  const response = await fetch(`${BASE}/historial/rutas?${params}`, { headers: encabezados() });
  return leer(response, "No se pudo cargar el historial de rutas.");
}

export async function obtenerRuta(id) {
  const response = await fetch(`${BASE}/rutas/${encodeURIComponent(id)}`, { headers: encabezados() });
  return leer(response, "No se pudo cargar la ruta.");
}
