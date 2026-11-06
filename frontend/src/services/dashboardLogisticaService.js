import { apiConfig } from "./api";

function encabezados(extra = {}) {
  const token =
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem("accessToken")) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("accessToken")) ||
    "";
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function exigirOk(response, mensaje) {
  if (!response.ok) {
    const texto = await response.text().catch(() => "");
    let detalle = mensaje;
    try {
      const datos = texto ? JSON.parse(texto) : null;
      const posible = datos?.message;
      detalle = Array.isArray(posible) ? posible.join(". ") : posible || mensaje;
    } catch {
      if (texto) detalle = texto;
    }
    const error = new Error(detalle);
    error.status = response.status;
    throw error;
  }
  return response;
}

/**
 * ABC-328: Consulta de métricas e indicadores del dashboard de logística (ABC-107).
 * Soporta filtro opcional por período con { desde, hasta }.
 *
 * @param {Object} [filtros={}]
 * @param {string} [filtros.desde] - Fecha inicial en formato YYYY-MM-DD
 * @param {string} [filtros.hasta] - Fecha final en formato YYYY-MM-DD
 * @returns {Promise<Object>}
 */
export async function obtenerMetricasDashboardLogistica(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros?.desde) params.append("desde", filtros.desde);
  if (filtros?.hasta) params.append("hasta", filtros.hasta);

  const querystring = params.toString();
  const url = `${apiConfig.apiUrl}/api/logistica/dashboard/metricas${querystring ? `?${querystring}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: encabezados(),
  });

  await exigirOk(response, "Error al obtener las métricas del dashboard de logística.");
  return await response.json();
}
