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

// Solo lecturas: imprimir una boleta nunca cambia su estado ni sus cantidades.
export async function obtenerBoleta(id) {
  const response = await fetch(`${LOGISTICA}/boletas/${encodeURIComponent(id)}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudo cargar la boleta.");
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
