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
