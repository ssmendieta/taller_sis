import { apiConfig } from "./api.js";
import { ESTADOS_RUTA } from "./historialLogisticoService.js";

export const ESTADOS_BOLETA_REPORTE = { BORRADOR: "Borrador", EMITIDA: "Emitida", ANULADA: "Anulada" };
export const FILTROS_REPORTE_LOGISTICO = { fechaDesde: "", fechaHasta: "", estadoRuta: "", estadoBoleta: "" };

function fechaEnMilisegundos(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NaN;
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const valor = new Date(Date.UTC(anio, mes - 1, dia));
  return valor.getUTCFullYear() === anio && valor.getUTCMonth() === mes - 1 && valor.getUTCDate() === dia
    ? valor.getTime() : NaN;
}

// ABC-342 reutiliza estos parámetros con los filtros efectivos de la vista previa.
export function parametrosReporteLogistico({ fechaDesde, fechaHasta, estadoRuta, estadoBoleta }) {
  const desde = fechaEnMilisegundos(fechaDesde);
  const hasta = fechaEnMilisegundos(fechaHasta);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) throw new Error("Ingresa ambas fechas con valores válidos.");
  if (desde > hasta) throw new Error("La fecha desde no puede ser posterior a la fecha hasta.");
  if ((hasta - desde) / 86400000 + 1 > 366) throw new Error("El período no puede superar 366 días.");
  if (estadoRuta && !Object.hasOwn(ESTADOS_RUTA, estadoRuta)) throw new Error("El estado de ruta es inválido.");
  if (estadoBoleta && !Object.hasOwn(ESTADOS_BOLETA_REPORTE, estadoBoleta)) throw new Error("El estado de boleta es inválido.");
  const parametros = new URLSearchParams({ fechaDesde, fechaHasta });
  if (estadoRuta) parametros.set("estadoRuta", estadoRuta);
  if (estadoBoleta) parametros.set("estadoBoleta", estadoBoleta);
  return parametros;
}

export async function consultarReporteLogistico(filtros, { signal } = {}) {
  const parametros = parametrosReporteLogistico(filtros);
  const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  const respuesta = await fetch(`${apiConfig.gatewayUrl}/api/logistica/reportes/logistica?${parametros}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal,
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = datos?.message;
    const error = new Error((Array.isArray(mensaje) ? mensaje.join(". ") : mensaje) || "No se pudo consultar el reporte logístico.");
    error.status = respuesta.status;
    throw error;
  }
  const efectivos = datos?.filtros;
  if (!efectivos || !Object.keys(FILTROS_REPORTE_LOGISTICO).every((campo) =>
    (efectivos[campo] ?? "") === (parametros.get(campo) ?? "")) ||
    !Number.isFinite(Date.parse(datos.generadoEn)) || !Array.isArray(datos.rutas) ||
    !Array.isArray(datos.boletas) || !Array.isArray(datos.avisos) ||
    !datos.resumen?.rutas?.porEstado || !datos.resumen.entregas ||
    !datos.resumen.incidencias?.porTipo || !datos.resumen.boletas?.porEstado ||
    !datos.resumen.boletas.cantidadEmitidaPorUnidad) {
    throw new Error("El servidor devolvió un reporte logístico incompleto o con filtros distintos.");
  }
  return datos;
}
