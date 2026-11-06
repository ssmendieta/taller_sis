import { apiConfig } from "./api.js";

export const PERMISO_CONSULTAR_DEMANDAS = "ordenes.consultar";

export const ORIGENES_DEMANDA = ["VENTAS", "FACTURACION"];

export const ESTADOS_DEMANDA = {
  RECIBIDA: { texto: "Recibida", clase: "ts-badge--PLANIFICADA" },
  CONFIRMADA: { texto: "Confirmada", clase: "ts-badge--FINALIZADA" },
};

function encabezados() {
  const token =
    sessionStorage.getItem("accessToken") ||
    localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function leer(response, mensajeDefault) {
  if (!response.ok) {
    const datos = await response.json().catch(() => null);
    const detalle = datos?.message;
    const error = new Error((Array.isArray(detalle) ? detalle.join(". ") : detalle) || mensajeDefault);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

const BASE = `${apiConfig.gatewayUrl}/api/produccion`;

export async function listarDemandas({ origen, estado, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (origen) params.set("origen", origen);
  if (estado) params.set("estado", estado);
  const response = await fetch(`${BASE}/demandas?${params}`, { headers: encabezados() });
  return leer(response, "No se pudieron cargar las demandas.");
}
