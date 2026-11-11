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

async function exigirOk(response, mensaje) {
  if (!response.ok) {
    const datos = await response.json().catch(() => null);
    const detalle = datos?.message;
    const error = new Error(
      (Array.isArray(detalle) ? detalle.join(". ") : detalle) || mensaje,
    );
    error.status = response.status;
    throw error;
  }
  return response;
}

export const PERMISO_REGISTRAR_REPROCESO = "calidad.registrar_conformes";

function urlOrden(ordenId) {
  return `${apiConfig.gatewayUrl}/api/produccion/ordenes/${encodeURIComponent(ordenId)}/reprocesos`;
}

export async function listarReprocesosOrden(ordenId) {
  const response = await fetch(urlOrden(ordenId), {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudieron cargar los reprocesos de la orden.");
  return response.json();
}

export async function registrarReproceso({
  ordenId,
  resultadoCalidadId,
  cantidadProcesada,
  cantidadRecuperada,
  cantidadDescartada,
}) {
  const response = await fetch(urlOrden(ordenId), {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      resultadoCalidadId: String(resultadoCalidadId),
      cantidadProcesada,
      cantidadRecuperada,
      cantidadDescartada,
    }),
  });

  await exigirOk(response, "No se pudo registrar el reproceso.");
  return response.json();
}
