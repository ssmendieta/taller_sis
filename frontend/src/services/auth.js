import { apiConfig } from "./api.js";

export async function iniciarSesion(correo, password) {
  let respuesta;
  try {
    respuesta = await fetch(`${apiConfig.gatewayUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo: correo.trim(), password }),
    });
  } catch {
    throw new Error("No hay conexión con el servicio de autenticación.");
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const mensaje = datos?.message;
    throw new Error((Array.isArray(mensaje) ? mensaje.join(". ") : mensaje) || "No se pudo iniciar sesión.");
  }
  return datos;
}

export async function cerrarSesionServidor() {
  const token = sessionStorage.getItem("accessToken");
  if (!token) return;
  try {
    await fetch(`${apiConfig.gatewayUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // El cierre local siempre se ejecuta aunque falle la red.
  }
}
