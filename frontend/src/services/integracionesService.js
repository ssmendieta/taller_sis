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

// Conserva el código HTTP: la pantalla distingue 403 y 409 de otros fallos.
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

// ABC-267: la API exige `integraciones.reintentar` para consultar y para reintentar.
export const PERMISO_INTEGRACIONES = "integraciones.reintentar";
export const ESTADOS_OUTBOX = ["PENDIENTE", "PROCESANDO", "PUBLICADO"];
export const LIMITE_EVENTOS = 20;

// ABC-388: Producción y Logística tienen outbox separados; cada origen se consulta aparte.
export const ORIGENES_INTEGRACION = {
  produccion: { texto: "Producción", descripcion: "Inventarios (materiales) y Contabilidad" },
  logistica: { texto: "Logística", descripcion: "Inventarios (salida de productos despachados)" },
};

const base = (origen) => `${apiConfig.gatewayUrl}/api/${origen === "logistica" ? "logistica" : "produccion"}/integraciones/eventos`;

export async function listarEventos({ estado, page = 1, limit = LIMITE_EVENTOS, origen = "produccion" } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (estado) params.set("estado", estado);

  const response = await fetch(`${base(origen)}?${params}`, { headers: encabezados() });

  await exigirOk(response, "No se pudieron cargar los mensajes de integración.");
  return response.json();
}

// POST sin cuerpo: adelanta el próximo intento del mismo evento, sin
// reemplazar su payload ni confirmar que el receptor lo procesó.
export async function reintentarEvento(id, origen = "produccion") {
  const response = await fetch(`${base(origen)}/${encodeURIComponent(id)}/reintentar`, {
    method: "POST",
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudo programar el reintento.");
  return response.json();
}
