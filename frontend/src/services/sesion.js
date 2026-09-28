// La sesión pertenece a esta pestaña. El JWT también expira en el servidor.
export const LIMITE_INACTIVIDAD_MS = 15 * 60 * 1000;

function expiraJWT(token) {
  try {
    const parte = token.split(".")[1];
    const payload = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")));
    return Number(payload.exp) * 1000;
  } catch {
    return 0;
  }
}

export function cerrarSesion() {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem("accessToken");
    storage.removeItem("usuario");
    storage.removeItem("ultimaActividad");
  }
}

export function obtenerSesion(ahora = Date.now()) {
  try {
    const token = sessionStorage.getItem("accessToken");
    const usuario = JSON.parse(sessionStorage.getItem("usuario") || "null");
    const ultimaActividad = Number(sessionStorage.getItem("ultimaActividad"));
    if (!token || !usuario?.id || !Number.isFinite(ultimaActividad) ||
        ultimaActividad <= 0 || ahora - ultimaActividad >= LIMITE_INACTIVIDAD_MS ||
        ahora >= expiraJWT(token)) {
      cerrarSesion();
      return null;
    }
    return usuario;
  } catch {
    cerrarSesion();
    return null;
  }
}

export function registrarActividad(ahora = Date.now()) {
  if (!obtenerSesion(ahora)) return false;
  sessionStorage.setItem("ultimaActividad", String(ahora));
  return true;
}

export function guardarSesion(respuesta, ahora = Date.now()) {
  const { accessToken, usuario } = respuesta ?? {};
  if (!accessToken || !usuario?.id || expiraJWT(accessToken) <= ahora) {
    throw new Error("El servidor no devolvió una sesión válida.");
  }
  cerrarSesion();
  sessionStorage.setItem("accessToken", accessToken);
  sessionStorage.setItem("usuario", JSON.stringify(usuario));
  sessionStorage.setItem("ultimaActividad", String(ahora));
  return usuario;
}
