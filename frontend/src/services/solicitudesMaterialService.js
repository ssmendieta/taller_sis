
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

// Conserva el código HTTP: la pantalla distingue 409 y los errores operativos (5xx, red).
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

const BASE = `${apiConfig.gatewayUrl}/api/produccion/solicitudes-material`;

// Estado que guarda nuestra API cuando el consumidor procesa la respuesta de
// Inventarios (ABC-244): PENDIENTE hasta que llega; luego APROBADA o CANCELADA.
export const ESTADOS_INVENTARIO = {
  PENDIENTE: { etiqueta: "Pendiente de Inventarios", clase: "ts-badge--PENDIENTE" },
  APROBADA: { etiqueta: "Aprobada por Inventarios", clase: "ts-badge--FINALIZADA" },
  CANCELADA: { etiqueta: "Cancelada por Inventarios", clase: "ts-badge--CANCELADA" },
};

export function estadoInventario(solicitud) {
  const base = ESTADOS_INVENTARIO[solicitud?.estado];
  if (!base) {
    return { estado: null, etiqueta: "Estado no informado", clase: "ts-badge--inactivo", motivo: null, respondidaEn: null };
  }
  const respondida = solicitud.estado !== "PENDIENTE";
  return {
    estado: solicitud.estado,
    ...base,
    motivo: respondida ? solicitud.motivoEstado ?? null : null,
    respondidaEn: respondida ? solicitud.estadoActualizadoEn ?? null : null,
  };
}

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
