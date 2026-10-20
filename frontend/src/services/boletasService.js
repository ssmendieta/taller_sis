import { apiConfig } from "./api.js";

function encabezados(extra = {}) {
  const token =
    sessionStorage.getItem("accessToken") ||
    localStorage.getItem("accessToken");

  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Conserva el código HTTP para distinguir 403 y 404 en la pantalla.
async function exigirOk(response, mensaje) {
  if (!response.ok) {
    const datos = await response.json().catch(() => null);
    const detalle = datos?.message;
    const error = new Error(
      (Array.isArray(detalle) ? detalle.join(". ") : detalle) || mensaje
    );
    error.status = response.status;
    throw error;
  }
  return response;
}

export const PERMISO_CONSULTAR_BOLETAS = "logistica.boletas.consultar";
export const ESTADO_BOLETA_EMITIDA = "EMITIDA";

const LOGISTICA = `${apiConfig.gatewayUrl}/api/logistica`;

// Listado paginado con filtros opcionales; llamar sin argumentos conserva los valores del servidor.
export async function listarBoletas(filtros = {}) {
  const params = new URLSearchParams();
  for (const campo of ["orden", "ordenId", "estado", "fechaDesde", "fechaHasta", "page", "limit"]) {
    if (filtros[campo] !== undefined && String(filtros[campo]).trim()) {
      params.set(campo, String(filtros[campo]).trim());
    }
  }
  const query = params.toString() ? `?${params}` : "";
  const response = await fetch(`${LOGISTICA}/boletas${query}`, { headers: encabezados() });

  await exigirOk(response, "No se pudieron cargar las boletas.");
  return response.json();
}

export async function listarSolicitudesSalida() {
  const response = await fetch(`${LOGISTICA}/solicitudes-salida`, { headers: encabezados() });
  await exigirOk(response, "No se pudieron cargar las solicitudes de salida.");
  return response.json();
}

export async function crearSolicitudSalida(datos) {
  const response = await fetch(`${LOGISTICA}/solicitudes-salida`, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify(datos),
  });
  await exigirOk(response, "No se pudo crear la solicitud de salida.");
  return response.json();
}

export async function crearBoleta(datos) {
  const response = await fetch(`${LOGISTICA}/boletas`, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify(datos),
  });
  await exigirOk(response, "No se pudo crear la boleta.");
  return response.json();
}

export async function actualizarBoletaItems(id, items) {
  const response = await fetch(`${LOGISTICA}/boletas/${encodeURIComponent(id)}/items`, {
    method: "PUT",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({ items }),
  });
  await exigirOk(response, "No se pudieron actualizar los ítems de la boleta.");
  return response.json();
}

// Solo lecturas: imprimir una boleta nunca cambia su estado ni sus cantidades.
export async function obtenerBoleta(id) {
  const response = await fetch(`${LOGISTICA}/boletas/${encodeURIComponent(id)}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudo cargar la boleta.");
  return response.json();
}

// Emite una boleta en borrador; pasa a EMITIDA y registra el autor emisor en el backend.
export async function emitirBoleta(id) {
  const response = await fetch(`${LOGISTICA}/boletas/${encodeURIComponent(id)}/emitir`, {
    method: "POST",
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudo emitir la boleta.");
  return response.json();
}

export async function anularBoleta(id, motivo) {
  const response = await fetch(`${LOGISTICA}/boletas/${encodeURIComponent(id)}/anular`, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({ motivo }),
  });

  await exigirOk(response, "No se pudo anular la boleta.");
  return response.json();
}

// La boleta solo guarda la solicitud; orden y destino vienen de la solicitud de salida.
export async function obtenerSolicitudSalida(id) {
  const response = await fetch(`${LOGISTICA}/solicitudes-salida/${encodeURIComponent(id)}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudo cargar la solicitud de salida de la boleta.");
  return response.json();
}

// Consulta documental de trazabilidad (ABC-306)
export async function consultarTrazabilidad(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.ordenId) params.set("ordenId", String(filtros.ordenId).trim());
  if (filtros.loteId) params.set("loteId", String(filtros.loteId).trim());
  if (filtros.boletaId) params.set("boletaId", String(filtros.boletaId).trim());
  if (filtros.q) params.set("q", String(filtros.q).trim());

  const queryStr = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${LOGISTICA}/trazabilidad${queryStr}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudo consultar la trazabilidad documental.");
  return response.json();
}
