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

// Conserva el código HTTP y el mensaje del backend para mostrarlo tal cual.
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

export const PERMISO_REGISTRAR_PERDIDA = "materiales.registrar_consumo";
export const MAX_MOTIVO_PERDIDA = 500;

const BASE = `${apiConfig.gatewayUrl}/api/produccion/perdidas-materia-prima`;

// ABC-74: solo las pérdidas de la orden, por fecha y luego id.
export async function listarPerdidasOrden(ordenId) {
  const response = await fetch(`${BASE}/orden/${encodeURIComponent(ordenId)}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudieron cargar las pérdidas de la orden.");
  return response.json();
}

// Autor y fecha los pone el servidor; solo se envían los datos que escribe la persona.
export async function registrarPerdida({ ordenId, materialId, cantidad, unidad, motivo }) {
  const response = await fetch(BASE, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ordenId, materialId, cantidad, unidad, motivo }),
  });

  await exigirOk(response, "No se pudo registrar la pérdida.");
  return response.json();
}
