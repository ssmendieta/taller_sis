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

// ABC-497: valor, meta y color del semáforo de cada KPI (todo el historial).
export async function obtenerKpisLogistica() {
  const response = await fetch(`${apiConfig.apiUrl}/api/logistica/dashboard/kpis`, { headers: encabezados() });
  await exigirOk(response, "Error al obtener los KPIs.");
  return await response.json();
}

export async function obtenerMetasKpiLogistica() {
  const response = await fetch(`${apiConfig.apiUrl}/api/logistica/dashboard/kpis/metas`, { headers: encabezados() });
  await exigirOk(response, "No se pudieron cargar las metas de Logística.");
  return response.json();
}

export async function guardarMetaKpiLogistica(kpi, datos) {
  const response = await fetch(`${apiConfig.apiUrl}/api/logistica/dashboard/kpis/metas/${encodeURIComponent(kpi)}`, {
    method: "PUT", headers: encabezados({ "Content-Type": "application/json" }), body: JSON.stringify(datos),
  });
  await exigirOk(response, "No se pudo guardar la meta de Logística.");
  return response.json();
}

// ABC-513: registros que componen un KPI, con filtro opcional de período.
export async function obtenerDetalleKpiLogistica(kpi, filtros = {}) {
  const params = new URLSearchParams();
  for (const campo of ["desde", "hasta", "chofer", "vehiculo"]) {
    if (filtros?.[campo]) params.append(campo, filtros[campo]);
  }
  const consulta = params.toString();
  const response = await fetch(
    `${apiConfig.apiUrl}/api/logistica/dashboard/kpis/${encodeURIComponent(kpi)}/detalle${consulta ? `?${consulta}` : ""}`,
    { headers: encabezados() },
  );
  await exigirOk(response, "Error al obtener el detalle del KPI.");
  return await response.json();
}

// ABC-520: KPIs de Logística por chofer o vehículo (dimension CHOFER o VEHICULO).
export async function obtenerRankingLogistica({ dimension, desde, hasta } = {}) {
  const params = new URLSearchParams({ dimension });
  if (desde) params.append("desde", desde);
  if (hasta) params.append("hasta", hasta);
  const response = await fetch(`${apiConfig.apiUrl}/api/logistica/dashboard/kpis/ranking?${params}`, { headers: encabezados() });
  await exigirOk(response, "Error al obtener el ranking de choferes y vehículos.");
  return await response.json();
}

// ABC-501: avisos de KPI en rojo (endpoints de ABC-500 y ABC-526).
export async function listarAvisosLogistica() {
  const response = await fetch(`${apiConfig.apiUrl}/api/logistica/dashboard/kpis/avisos`, { headers: encabezados() });
  await exigirOk(response, "No se pudieron cargar los avisos.");
  return await response.json();
}

export async function contarAvisosSinLeerLogistica() {
  const response = await fetch(`${apiConfig.apiUrl}/api/logistica/dashboard/kpis/avisos/sin-leer`, { headers: encabezados() });
  await exigirOk(response, "No se pudo contar los avisos.");
  return (await response.json()).total;
}

export async function marcarAvisoLeidoLogistica(id) {
  const response = await fetch(`${apiConfig.apiUrl}/api/logistica/dashboard/kpis/avisos/${encodeURIComponent(id)}/leido`, {
    method: "PATCH", headers: encabezados(),
  });
  await exigirOk(response, "No se pudo marcar el aviso como leído.");
  return await response.json();
}
