import { apiConfig } from "./api";

const URL_USUARIOS = `${apiConfig.gatewayUrl}/api/auth/users`;

async function solicitar(ruta = "", { method = "GET", body, signal } = {}) {
  const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  let respuesta;
  try {
    respuesta = await fetch(`${URL_USUARIOS}${ruta}`, {
      method,
      signal,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(`No hay conexión con el API gateway (${apiConfig.gatewayUrl}).`);
  }

  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = datos?.message;
    throw new Error(
      Array.isArray(mensaje)
        ? mensaje.join(". ")
        : mensaje || `Error del servicio de usuarios (${respuesta.status}).`,
    );
  }
  return datos;
}

function exigirLista(datos, descripcion) {
  if (!Array.isArray(datos)) throw new Error(`El servicio de ${descripcion} devolvió una respuesta inválida.`);
  return datos;
}

export async function listarUsuarios(signal, incluirEliminados = false) {
  const ruta = incluirEliminados ? "?incluirEliminados=true" : "";
  return exigirLista(await solicitar(ruta, { signal }), "usuarios");
}

export async function listarRolesActivos(signal) {
  return exigirLista(await solicitar("/roles-disponibles", { signal }), "roles");
}

export function crearUsuario(datos) {
  return solicitar("", { method: "POST", body: datos });
}

export function actualizarUsuario(id, datos) {
  return solicitar(`/${encodeURIComponent(id)}`, { method: "PUT", body: datos });
}

export function cambiarEstadoUsuario(id, activo) {
  return solicitar(`/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { activo } });
}

export function darDeBajaUsuario(id) {
  return solicitar(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}
