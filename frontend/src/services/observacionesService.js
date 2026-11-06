import { apiConfig } from "./api.js";

export const TIPOS_OBSERVACION = [
  { valor: "OBSERVACION", etiqueta: "Observación" },
  { valor: "INCIDENCIA", etiqueta: "Incidencia" },
];
export const MAX_DESCRIPCION_OBSERVACION = 1000;
// Registrar exige el permiso de ejecución de la orden (mismo que avances).
export const PERMISO_REGISTRAR_OBSERVACION = "ordenes.registrar_avance";

function encabezados(extra = {}) {
  const token =
    sessionStorage.getItem("accessToken") ||
    localStorage.getItem("accessToken");

  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

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

const BASE = `${apiConfig.gatewayUrl}/api/produccion/observaciones`;

export async function listarObservacionesOrden(ordenId) {
  const response = await fetch(`${BASE}/orden/${encodeURIComponent(ordenId)}`, {
    headers: encabezados(),
  });
  await exigirOk(response, "No se pudieron cargar las observaciones.");
  return response.json();
}

export async function registrarObservacion({ ordenId, tipo, descripcion }) {
  const response = await fetch(BASE, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ordenId: Number(ordenId), tipo, descripcion }),
  });
  await exigirOk(response, "No se pudo registrar la observación.");
  return response.json();
}
