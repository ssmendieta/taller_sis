import { apiConfig } from "./api.js";

export const PERMISO_HISTORIAL_PRODUCCION = "ordenes.consultar";

export const ESTADOS_ORDEN_HISTORIAL = [
  "CREADA",
  "PLANIFICADA",
  "EN_PROCESO",
  "COMPLETADA",
  "CANCELADA",
];

export const FILTROS_HISTORIAL_INICIALES = {
  fechaDesde: "",
  fechaHasta: "",
  estado: "",
  producto: "",
  page: 1,
  limit: 10,
};

export function validarFiltrosHistorial(filtros = {}) {
  if (!filtros || typeof filtros !== "object" || Array.isArray(filtros)) {
    throw new Error("Los filtros deben ser un objeto válido.");
  }

  const permitidos = Object.keys(FILTROS_HISTORIAL_INICIALES);
  for (const campo of Object.keys(filtros)) {
    if (!permitidos.includes(campo)) {
      throw new Error(`Parámetro no permitido: ${campo}`);
    }
  }

  const resultado = {
    page: 1,
    limit: 10,
  };

  if (filtros.page !== undefined && filtros.page !== null) {
    const pageNum = Number(filtros.page);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      throw new Error("La página debe ser un número entero mayor o igual a 1.");
    }
    resultado.page = pageNum;
  }

  if (filtros.limit !== undefined && filtros.limit !== null) {
    const limitNum = Number(filtros.limit);
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new Error("El límite debe ser un número entero entre 1 y 100.");
    }
    resultado.limit = limitNum;
  }

  for (const campo of ["fechaDesde", "fechaHasta"]) {
    const valor = filtros[campo];
    if (valor === "" || valor == null) continue;
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      throw new Error("Las fechas deben tener el formato AAAA-MM-DD.");
    }
    const fecha = new Date(`${valor}T00:00:00Z`);
    if (valor < "0001-01-01" || !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
      throw new Error("Las fechas deben ser fechas válidas del calendario.");
    }
    resultado[campo] = valor;
  }

  if (resultado.fechaDesde && resultado.fechaHasta && resultado.fechaDesde > resultado.fechaHasta) {
    throw new Error("La fecha desde no puede ser posterior a la fecha hasta.");
  }

  if (filtros.estado != null && filtros.estado !== "") {
    if (typeof filtros.estado !== "string") {
      throw new Error("El estado debe ser texto.");
    }
    const estadoTrim = filtros.estado.trim();
    if (estadoTrim && !ESTADOS_ORDEN_HISTORIAL.includes(estadoTrim)) {
      throw new Error(`Estado inválido. Debe ser uno de: ${ESTADOS_ORDEN_HISTORIAL.join(", ")}`);
    }
    if (estadoTrim) {
      resultado.estado = estadoTrim;
    }
  }

  if (filtros.producto != null && filtros.producto !== "") {
    if (typeof filtros.producto !== "string") {
      throw new Error("El producto debe ser texto.");
    }
    const productoTrim = filtros.producto.trim();
    if (productoTrim.length > 150) {
      throw new Error("El filtro de producto admite hasta 150 caracteres.");
    }
    if (productoTrim) {
      resultado.producto = productoTrim;
    }
  }

  return resultado;
}

export async function consultarHistorialOrdenes(filtros = {}, { signal } = {}) {
  const filtrosValidados = validarFiltrosHistorial(filtros);

  // El backend exige omitir parámetros vacíos (no enviar cadenas en blanco).
  const params = new URLSearchParams({
    page: String(filtrosValidados.page),
    limit: String(filtrosValidados.limit),
  });

  if (filtrosValidados.fechaDesde) params.set("fechaDesde", filtrosValidados.fechaDesde);
  if (filtrosValidados.fechaHasta) params.set("fechaHasta", filtrosValidados.fechaHasta);
  if (filtrosValidados.estado) params.set("estado", filtrosValidados.estado);
  if (filtrosValidados.producto) params.set("producto", filtrosValidados.producto);

  const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  const response = await fetch(
    `${apiConfig.gatewayUrl}/api/produccion/historial/ordenes?${params.toString()}`,
    {
      signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );

  const datos = await response.json().catch(() => null);

  if (!response.ok) {
    const mensaje = datos?.message;
    const error = new Error(
      (Array.isArray(mensaje) ? mensaje.join(". ") : mensaje) ||
      "No se pudo consultar el historial de órdenes de producción."
    );
    error.status = response.status;
    throw error;
  }

  if (!datos || !Array.isArray(datos.items) || typeof datos.total !== "number") {
    throw new Error("El servicio devolvió un historial con formato inválido.");
  }

  return datos;
}
