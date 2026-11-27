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
 * ABC-324: Consulta de métricas e indicadores del dashboard de producción (ABC-106).
 * Soporta filtro opcional por período con { desde, hasta }.
 *
 * @param {Object} [filtros={}]
 * @param {string} [filtros.desde] - Fecha inicial en formato YYYY-MM-DD
 * @param {string} [filtros.hasta] - Fecha final en formato YYYY-MM-DD
 * @returns {Promise<Object>}
 */
export async function obtenerMetricasDashboard(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros?.desde) params.append("desde", filtros.desde);
  if (filtros?.hasta) params.append("hasta", filtros.hasta);

  const querystring = params.toString();
  const url = `${apiConfig.apiUrl}/api/produccion/dashboard/metricas${querystring ? `?${querystring}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: encabezados(),
  });

  await exigirOk(response, "Error al obtener las métricas del dashboard de producción.");
  return await response.json();
}

// ABC-497: valor, meta y color del semáforo de cada KPI (todo el historial).
export async function obtenerKpisProduccion() {
  const response = await fetch(`${apiConfig.apiUrl}/api/produccion/dashboard/kpis`, { headers: encabezados() });
  await exigirOk(response, "Error al obtener los KPIs.");
  return await response.json();
}

export async function obtenerMetasKpiProduccion() {
  const response = await fetch(`${apiConfig.apiUrl}/api/produccion/dashboard/kpis/metas`, { headers: encabezados() });
  await exigirOk(response, "No se pudieron cargar las metas de Producción.");
  return response.json();
}

export async function guardarMetaKpiProduccion(kpi, datos) {
  const response = await fetch(`${apiConfig.apiUrl}/api/produccion/dashboard/kpis/metas/${encodeURIComponent(kpi)}`, {
    method: "PUT", headers: encabezados({ "Content-Type": "application/json" }), body: JSON.stringify(datos),
  });
  await exigirOk(response, "No se pudo guardar la meta de Producción.");
  return response.json();
}

// ABC-513: registros que componen un KPI, con filtro opcional de período.
export async function obtenerDetalleKpiProduccion(kpi, filtros = {}) {
  const params = new URLSearchParams();
  if (filtros?.desde) params.append("desde", filtros.desde);
  if (filtros?.hasta) params.append("hasta", filtros.hasta);
  const consulta = params.toString();
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/dashboard/kpis/${encodeURIComponent(kpi)}/detalle${consulta ? `?${consulta}` : ""}`,
    { headers: encabezados() },
  );
  await exigirOk(response, "Error al obtener el detalle del KPI.");
  return await response.json();
}

// ABC-501: avisos de KPI en rojo (endpoints de ABC-500 y ABC-526).
export async function listarAvisosProduccion() {
  const response = await fetch(`${apiConfig.apiUrl}/api/produccion/dashboard/kpis/avisos`, { headers: encabezados() });
  await exigirOk(response, "No se pudieron cargar los avisos.");
  return await response.json();
}

export async function contarAvisosSinLeerProduccion() {
  const response = await fetch(`${apiConfig.apiUrl}/api/produccion/dashboard/kpis/avisos/sin-leer`, { headers: encabezados() });
  await exigirOk(response, "No se pudo contar los avisos.");
  return (await response.json()).total;
}

export async function marcarAvisoLeidoProduccion(id) {
  const response = await fetch(`${apiConfig.apiUrl}/api/produccion/dashboard/kpis/avisos/${encodeURIComponent(id)}/leido`, {
    method: "PATCH", headers: encabezados(),
  });
  await exigirOk(response, "No se pudo marcar el aviso como leído.");
  return await response.json();
}

// ABC-471: FPY del período (cálculo de ABC-470, dentro de las métricas). fpy null = sin datos.
export async function obtenerFpyProduccion(filtros = {}) {
  const { calidad } = await obtenerMetricasDashboard(filtros);
  return {
    fpy: calidad.fpy,
    evaluadas: calidad.total_evaluado,
    conformesPrimera: calidad.unidades_conformes_primera,
    recuperadas: calidad.unidades_recuperadas,
    porcentajeConformes: calidad.porcentaje_conformes,
  };
}
