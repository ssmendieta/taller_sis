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
      (Array.isArray(detalle) ? detalle.join(". ") : detalle) || mensaje
    );
    error.status = response.status;
    throw error;
  }
  return response;
}

const BASE = `${apiConfig.gatewayUrl}/api/produccion/consumos-material`;

export async function listarConsumosOrden(ordenId, materialId) {
  const params = new URLSearchParams();
  if (materialId != null) params.set("materialId", materialId);

  const query = params.toString();
  const response = await fetch(
    `${BASE}/orden/${ordenId}${query ? `?${query}` : ""}`,
    { headers: encabezados() }
  );

  await exigirOk(response, "No se pudieron cargar los consumos.");
  return response.json();
}

export async function obtenerTotalesConsumos(ordenId, materialId) {
  const params = new URLSearchParams();
  if (materialId != null) params.set("materialId", materialId);

  const query = params.toString();
  const response = await fetch(
    `${BASE}/orden/${ordenId}/totales${query ? `?${query}` : ""}`,
    { headers: encabezados() }
  );

  await exigirOk(response, "No se pudieron cargar los totales de consumo.");
  return response.json();
}

// ABC-72: el backend compara requerido (receta) y utilizado (consumos de ABC-71)
// por material y unidad; la diferencia ya viene como utilizado menos requerido.
// Responde 409 si las unidades no coinciden, sin sumarlas ni convertirlas.
export async function obtenerComparacionMateriales(ordenId) {
  const response = await fetch(
    `${apiConfig.gatewayUrl}/api/produccion/ordenes/${ordenId}/comparacion-materiales`,
    { headers: encabezados() }
  );

  await exigirOk(response, "No se pudo cargar la comparación de materiales.");
  return response.json();
}

export async function registrarConsumo(datos) {
  const response = await fetch(BASE, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify(datos),
  });

  await exigirOk(response, "No se pudo registrar el consumo.");
  return response.json();
}
