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

// Todas las boletas guardadas, de la más reciente a la más antigua.
export async function listarBoletas() {
  const response = await fetch(`${LOGISTICA}/boletas`, { headers: encabezados() });

  await exigirOk(response, "No se pudieron cargar las boletas.");
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

// La boleta solo guarda la solicitud; orden y destino vienen de la solicitud de salida.
export async function obtenerSolicitudSalida(id) {
  const response = await fetch(`${LOGISTICA}/solicitudes-salida/${encodeURIComponent(id)}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudo cargar la solicitud de salida de la boleta.");
  return response.json();
}
