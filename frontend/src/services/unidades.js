import { apiConfig } from "./api.js";
import { UNIDADES_RESPALDO } from "../constants/unidades.js";

let cache = null;

// Catálogo único del frontend: lo obtiene del backend (fuente de verdad).
// Si el backend no responde, usa el respaldo local (misma lista).
export async function obtenerUnidades() {
  if (cache) return cache;
  const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  try {
    const respuesta = await fetch(`${apiConfig.apiUrl}/api/produccion/unidades-medida`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!respuesta.ok) throw new Error("catálogo no disponible");
    const datos = await respuesta.json();
    if (Array.isArray(datos) && datos.length > 0) {
      cache = datos;
      return cache;
    }
    throw new Error("catálogo vacío");
  } catch {
    cache = UNIDADES_RESPALDO;
    return cache;
  }
}

export function limpiarCacheUnidades() {
  cache = null;
}
