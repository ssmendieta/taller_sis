
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
    throw new Error(
      (Array.isArray(detalle) ? detalle.join(". ") : detalle) || mensaje
    );
  }
  return response;
}

const BASE = `${apiConfig.gatewayUrl}/api/produccion/solicitudes-material`;

export async function listarSolicitudesMaterial() {
  const response = await fetch(BASE, { headers: encabezados() });
  await exigirOk(response, "No se pudieron cargar las solicitudes.");
  return response.json();
}

export async function obtenerSolicitudMaterial(id) {
  const response = await fetch(`${BASE}/${id}`, {
    headers: encabezados(),
  });
  await exigirOk(response, "No se pudo cargar el detalle.");
  return response.json();
}

export async function crearSolicitudMaterial(datos) {
  const response = await fetch(BASE, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify(datos),
  });
  await exigirOk(response, "No se pudo registrar la solicitud.");
  return response.json();
}
