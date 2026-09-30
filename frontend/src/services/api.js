
const API_GATEWAY_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_GATEWAY_URL || "http://localhost:3000";
export const apiConfig = { gatewayUrl: API_GATEWAY_URL, apiUrl: API_GATEWAY_URL };

export async function cambiarEstadoOrdenProduccion(id, nuevoEstado, motivo) {
  const token = sessionStorage.getItem("accessToken");
  const respuesta = await fetch(`${API_GATEWAY_URL}/api/produccion/ordenes/${encodeURIComponent(id)}/estado`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ nuevoEstado, ...(motivo ? { motivo } : {}) }),
  });

  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = datos?.message;
    throw new Error(
      (Array.isArray(mensaje) ? mensaje.join(". ") : mensaje) ||
        `No se pudo actualizar la orden (${respuesta.status}).`,
    ); 
  }
  return datos;
}

export async function crearOrdenProduccion(datos) {
  const token = sessionStorage.getItem("accessToken");
  const respuesta = await fetch(`${API_GATEWAY_URL}/api/produccion/ordenes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(datos),
  });

  const contenido = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const detalle = contenido?.message;
    throw new Error(
      (Array.isArray(detalle) ? detalle.join(". ") : detalle) ||
      "No se pudo registrar la orden. Verifica los datos e intenta de nuevo.",
    );
  }

  if (!contenido?.id) {
    throw new Error("El servicio no confirmó el registro de la orden. Revisa el listado antes de intentarlo otra vez.");
  }
  return contenido;
}

export async function obtenerOrdenesProduccion(signal) {
  const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  const respuesta = await fetch(`${API_GATEWAY_URL}/api/produccion/ordenes/buscar`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!respuesta.ok) {
    throw new Error("No se pudieron cargar las órdenes. Intenta de nuevo.");
  }

  const datos = await respuesta.json().catch(() => null);
  const ordenes = Array.isArray(datos) ? datos : datos?.data;
  if (!Array.isArray(ordenes)) {
    throw new Error("El servicio de consulta de órdenes todavía no está disponible.");
  }
  return ordenes;
}

export async function obtenerAuditoria(signal) {
  const token = sessionStorage.getItem("accessToken");
  const respuesta = await fetch(`${API_GATEWAY_URL}/api/auth/auditoria/listado`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!respuesta.ok) {
    throw new Error("No se pudo cargar la auditoría. Intenta de nuevo.");
  }

  const datos = await respuesta.json().catch(() => null);
  const registros = Array.isArray(datos) ? datos : datos?.data ?? datos?.items;
  if (!Array.isArray(registros)) {
    throw new Error("El servicio de consulta de auditoría todavía no está disponible.");
  }
  return registros;
}
