import { apiConfig } from "./api.js";

const PREFIJO_BOLETA = "boleta-";

export function guardarBoletaLocal(boleta) {
  if (!boleta?.id) {
    throw new Error("No se puede guardar una boleta sin identificador.");
  }

  sessionStorage.setItem(
    `${PREFIJO_BOLETA}${boleta.id}`,
    JSON.stringify(boleta)
  );

  return boleta;
}

// ABC-353: la API exige el mismo permiso de consulta que trazabilidad.
export const PERMISO_CONSULTAR_RECURSOS = "logistica.boletas.consultar";
export const UNIDADES_CAPACIDAD = ["kg", "l", "m3", "unidad", "caja", "paquete"];

function encabezados() {
  const token =
    sessionStorage.getItem("accessToken") ||
    localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Conserva estado, código y motivo para distinguir "sin copia" de otros errores.
async function exigirOk(response, mensaje) {
  if (!response.ok) {
    const datos = await response.json().catch(() => null);
    const detalle = datos?.message;
    const error = new Error(
      (Array.isArray(detalle) ? detalle.join(". ") : detalle) || mensaje
    );
    error.status = response.status;
    error.codigo = datos?.codigo ?? null;
    error.motivo = datos?.motivo ?? null;
    throw error;
  }
  return response;
}

// Vehículos y choferes de una fecha con su origen (ERP o RESPALDO) y vigencia.
// Consultar no reserva recursos.
export async function consultarRecursosLogisticos(
  { fecha, disponible = "", capacidadMinima = "", unidad = "" },
  { signal } = {}
) {
  const parametros = new URLSearchParams({ fecha });
  if (disponible) parametros.set("disponible", disponible);
  if (String(capacidadMinima).trim()) {
    parametros.set("capacidadMinima", String(capacidadMinima).trim());
    parametros.set("unidad", unidad);
  }
  const response = await fetch(
    `${apiConfig.gatewayUrl}/api/logistica/recursos-logisticos?${parametros}`,
    { headers: encabezados(), signal }
  );
  await exigirOk(response, "No se pudieron consultar los recursos logísticos.");
  const datos = await response.json();
  if (
    datos?.fecha !== fecha ||
    !["ERP", "RESPALDO"].includes(datos.origen) ||
    !datos.sincronizadoEn ||
    !Array.isArray(datos.vehiculos) ||
    !Array.isArray(datos.choferes) ||
    (datos.origen === "RESPALDO" && !datos.aviso?.mensaje)
  ) {
    throw new Error("El servidor devolvió una consulta de recursos incompleta o inválida.");
  }
  return datos;
}

// ABC-377: acciones de ABC-376 sobre una ruta. La API devuelve la ruta completa
// con sus paradas; fecha y autor los registra el servidor.
export const PERMISO_GESTIONAR_RUTAS = "logistica.rutas.gestionar";
export const MAX_OBSERVACION_RUTA = 500;

async function accionRuta(url, rutaId, observacion, mensaje) {
  const response = await fetch(url, {
    method: "POST",
    headers: { ...encabezados(), "Content-Type": "application/json" },
    body: JSON.stringify({ observacion: observacion?.trim() || null }),
  });
  await exigirOk(response, mensaje);
  const ruta = await response.json();
  if (String(ruta?.id) !== String(rutaId) || !ruta.estado || !Array.isArray(ruta.paradas)) {
    throw new Error("El servidor no confirmó el cambio de la ruta.");
  }
  return ruta;
}

export function despacharRuta(rutaId, observacion) {
  return accionRuta(
    `${apiConfig.gatewayUrl}/api/logistica/rutas/${encodeURIComponent(rutaId)}/despacho`,
    rutaId, observacion, "No se pudo despachar la ruta."
  );
}

export function registrarEntrega(rutaId, paradaId, observacion) {
  return accionRuta(
    `${apiConfig.gatewayUrl}/api/logistica/rutas/${encodeURIComponent(rutaId)}/paradas/${encodeURIComponent(paradaId)}/entrega`,
    rutaId, observacion, "No se pudo registrar la entrega."
  );
}
