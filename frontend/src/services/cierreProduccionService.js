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

// Estado del reporte del cierre a Contabilidad que devuelve nuestra API en
// `reporteContable`: ENVIADO (publicado, sin respuesta todavía), RECIBIDO o RECHAZADO
// (respuesta RegistroContableResultado.v1). RECIBIDO es recepción, no aprobación contable.
export const ESTADOS_REPORTE_CONTABLE = {
  ENVIADO: "Enviado",
  RECIBIDO: "Recibido",
  RECHAZADO: "Rechazado",
};

export function estadoReporteContable(cierre) {
  const reporte = cierre?.reporteContable;
  if (!reporte || !Object.hasOwn(ESTADOS_REPORTE_CONTABLE, reporte.estado)) return null;
  return {
    estado: reporte.estado,
    codigoRechazo: reporte.codigoRechazo ?? null,
    detalle: reporte.detalle ?? null,
    actualizadoEn: reporte.actualizadoEn ?? null,
  };
}

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
