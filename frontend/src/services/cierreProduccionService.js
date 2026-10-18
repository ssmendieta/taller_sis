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

// Conserva el código HTTP: 404 indica cierre sin preparar y 409 un rechazo de la regla.
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

export const PERMISO_PREPARAR_CIERRE = "ordenes.finalizar_cancelar";
export const VERSION_CIERRE_INICIAL = 1;

const BASE = `${apiConfig.gatewayUrl}/api/produccion/cierres-produccion`;

// ABC-299: lee el snapshot guardado tal cual, sin recalcular desde avances, calidad o consumos.
export async function obtenerCierre(ordenId, cierreVersion = VERSION_CIERRE_INICIAL) {
  const params = new URLSearchParams({ cierreVersion: String(cierreVersion) });
  const response = await fetch(`${BASE}/orden/${ordenId}?${params}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudo cargar el resumen de cierre.");
  return response.json();
}

// El cierre trae `estadoContable` (PENDIENTE, RECIBIDO o RECHAZADO) y el resultado de Contabilidad; su presentación
// está en `resumenReporteContable` de utils/format.js.

// Solo se envían orden y versión; cantidades, consumos y fechas los toma el servidor.
// Repetir la misma versión responde 409 sin crear un segundo snapshot.
export async function prepararCierre(ordenId, cierreVersion = VERSION_CIERRE_INICIAL) {
  const response = await fetch(BASE, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ordenId, cierreVersion }),
  });

  await exigirOk(response, "No se pudo preparar el resumen de cierre.");
  return response.json();
}
