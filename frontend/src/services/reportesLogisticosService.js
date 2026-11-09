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

async function solicitarReporte(ruta, filtros, signal) {
  const parametros = parametrosReporteLogistico(filtros);
  const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  const respuesta = await fetch(`${apiConfig.gatewayUrl}/api/logistica/reportes/logistica${ruta}?${parametros}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal,
  });
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => null);
    const mensaje = datos?.message;
    const error = new Error((Array.isArray(mensaje) ? mensaje.join(". ") : mensaje) || "No se pudo obtener el reporte logístico.");
    error.status = respuesta.status;
    throw error;
  }
  return { respuesta, parametros };
}

export async function consultarReporteLogistico(filtros, { signal } = {}) {
  const { respuesta, parametros } = await solicitarReporte("", filtros, signal);
  const datos = await respuesta.json().catch(() => null);
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

const TIPOS_ARCHIVO = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function descargarReporteLogistico(filtros, formato, { signal } = {}) {
  if (!Object.hasOwn(TIPOS_ARCHIVO, formato)) throw new Error("Elige PDF o Excel.");
  const { respuesta } = await solicitarReporte(`/exportar/${formato}`, filtros, signal);
  const archivo = await respuesta.blob();
  if (signal?.aborted) return;
  if (archivo.type.split(";")[0] !== TIPOS_ARCHIVO[formato] || !archivo.size) {
    throw new Error("El servidor no devolvió un archivo válido.");
  }
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `reporte-logistico_${filtros.fechaDesde}_a_${filtros.fechaHasta}.${formato}`;
  document.body.append(enlace);
  try { enlace.click(); }
  finally {
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
