import { apiConfig } from "./api.js";

function token() {
  return sessionStorage.getItem("accessToken") ?? "";
}

async function pedir(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${apiConfig.gatewayUrl}${ruta}`, {
      ...opciones,
      headers: {
        "Content-Type": "application/json",
        ...(opciones.headers ?? {}),
        Authorization: `Bearer ${token()}`,
      },
    });
  } catch {
    throw new Error("No hay conexión con el servicio de autenticación.");
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = datos?.message;
    throw new Error(
      (Array.isArray(mensaje) ? mensaje.join(". ") : mensaje) ||
        "No se pudo completar la operación de roles.",
    );
  }
  return datos;
}

export function listarRoles() {
  return pedir("/api/auth/roles");
}

export function crearRol({ nombre, descripcion }) {
  return pedir("/api/auth/roles", {
    method: "POST",
    body: JSON.stringify({ nombre, descripcion }),
  });
}

export function actualizarRol(id, { nombre, descripcion, activo }) {
  return pedir(`/api/auth/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nombre, descripcion, activo }),
  });
}

export function reemplazarPermisosRol(id, permisoIds) {
  return pedir(`/api/auth/roles/${id}/permisos`, {
    method: "PUT",
    body: JSON.stringify({ permisoIds }),
  });
}

export function listarPermisos() {
  return pedir("/api/auth/permisos");
}
