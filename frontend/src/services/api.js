
const API_GATEWAY_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_GATEWAY_URL || "http://localhost:3000";
export const apiConfig = { gatewayUrl: API_GATEWAY_URL, apiUrl: API_GATEWAY_URL };

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
