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

// Conserva el código HTTP: la pantalla distingue 409 (código repetido o exceso).
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

export const MAX_CODIGO_LOTE = 80;

const BASE = `${apiConfig.gatewayUrl}/api/produccion/lotes`;

// ABC-294: la consulta usa el código de la orden, como la de Logística.
export async function listarLotesOrden(ordenCodigo) {
  const response = await fetch(`${BASE}/orden/${encodeURIComponent(ordenCodigo)}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudieron cargar los lotes de la orden.");
  return response.json();
}

// Responsable y fecha los fija el servidor; el backend valida código único
// y que la cantidad no supere los conformes sin asignar.
export async function crearLote({ ordenId, codigo, cantidad }) {
  const response = await fetch(BASE, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ordenId, codigo, cantidad }),
  });

  await exigirOk(response, "No se pudo crear el lote.");
  return response.json();
}
