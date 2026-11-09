import { apiConfig } from "./api.js";

export const PERMISO_REPORTES_PRODUCCION = "ordenes.consultar";
export const FILTROS_REPORTE_INICIALES = { fechaDesde: "", fechaHasta: "", producto: "" };

export function validarFiltrosReporte(filtros = {}) {
  if (!filtros || typeof filtros !== "object" || Array.isArray(filtros) ||
      Object.keys(filtros).some((campo) => !Object.hasOwn(FILTROS_REPORTE_INICIALES, campo))) {
    throw new Error("Solo se admiten fechaDesde, fechaHasta y producto.");
  }
  const resultado = {};
  for (const campo of ["fechaDesde", "fechaHasta"]) {
    const valor = filtros[campo];
    if (valor === "" || valor == null) continue;
    const fecha = new Date(`${valor}T00:00:00Z`);
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor < "0001-01-01" ||
        !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
      throw new Error("Las fechas deben ser fechas reales en formato AAAA-MM-DD.");
    }
    resultado[campo] = valor;
  }
  if (resultado.fechaDesde && resultado.fechaHasta && resultado.fechaDesde > resultado.fechaHasta) {
    throw new Error("La fecha desde no puede ser posterior a la fecha hasta.");
  }
  if (filtros.producto != null) {
    if (typeof filtros.producto !== "string") throw new Error("El producto debe ser texto.");
    const producto = filtros.producto.trim();
    if (producto.length > 150) throw new Error("El producto admite hasta 150 caracteres.");
    if (producto) resultado.producto = producto;
  }
  return resultado;
}

export async function consultarReporteProduccion(filtros = {}, { signal } = {}) {
  const params = new URLSearchParams(validarFiltrosReporte(filtros));
  const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  const response = await fetch(`${apiConfig.gatewayUrl}/api/produccion/reportes/produccion${params.size ? `?${params}` : ""}`, {
    signal, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const datos = await response.json().catch(() => null);
  if (!response.ok) {
    const mensaje = datos?.message;
    const error = new Error((Array.isArray(mensaje) ? mensaje.join(". ") : mensaje) || "No se pudo consultar el reporte de producción.");
    error.status = response.status;
    throw error;
  }
  if (!datos?.filtros || !Array.isArray(datos.ordenes) || !datos.totales ||
      !Array.isArray(datos.totales.productos) || !Array.isArray(datos.totales.consumos) || !Array.isArray(datos.totales.perdidas)) {
    throw new Error("El servicio devolvió un reporte con formato inválido.");
  }
  // Conservar el contrato y las cantidades decimales sin normalizar ni recalcular.
  return datos;
}
