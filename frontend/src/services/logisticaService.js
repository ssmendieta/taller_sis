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
    error.conflictos = Array.isArray(datos?.conflictos) ? datos.conflictos : [];
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

// ABC-382: incidencias y reprogramaciones de una ruta con el contrato propuesto
// para ABC-381 (services/logistica-service/src/incidencias/README.md).
export const TIPOS_INCIDENCIA = {
  RETRASO: "Retraso",
  AVERIA_VEHICULO: "Avería del vehículo",
  CLIENTE_AUSENTE: "Cliente ausente",
  DIRECCION_INCORRECTA: "Dirección incorrecta",
  CARGA_DANADA: "Carga dañada",
  OTRO: "Otro",
};
export const MAX_MOTIVO_INCIDENCIA = 500;

function historialIncidencias(datos, rutaId) {
  if (String(datos?.rutaId) !== String(rutaId) || !datos.fechaProgramada ||
      !Array.isArray(datos.incidencias) || !Array.isArray(datos.reprogramaciones)) {
    throw new Error("El servidor devolvió un historial de incidencias incompleto o inválido.");
  }
  return datos;
}

export async function obtenerHistorialIncidencias(rutaId, { signal } = {}) {
  const response = await fetch(
    `${apiConfig.gatewayUrl}/api/logistica/rutas/${encodeURIComponent(rutaId)}/incidencias`,
    { headers: encabezados(), signal }
  );
  await exigirOk(response, "No se pudo cargar el historial de incidencias.");
  return historialIncidencias(await response.json(), rutaId);
}

// Registra la incidencia y, si hay nuevaFecha, reprograma la ruta en el mismo paso.
export async function registrarIncidencia(rutaId, { tipo, motivo, paradaId, nuevaFecha }) {
  const response = await fetch(
    `${apiConfig.gatewayUrl}/api/logistica/rutas/${encodeURIComponent(rutaId)}/incidencias`,
    {
      method: "POST",
      headers: { ...encabezados(), "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, motivo: motivo.trim(), paradaId: paradaId || null, nuevaFecha: nuevaFecha || null }),
    }
  );
  await exigirOk(response, "No se pudo registrar la incidencia.");
  return historialIncidencias(await response.json(), rutaId);
}

// ABC-362: cada agrupación conserva sus solicitudes y la trazabilidad del deshacer.
async function solicitarAgrupaciones(ruta, mensaje, opciones = {}) {
  const response = await fetch(`${apiConfig.gatewayUrl}/api/logistica/agrupaciones${ruta}`, {
    ...opciones,
    headers: { ...encabezados(), ...opciones.headers },
  });
  await exigirOk(response, mensaje);
  return response.json();
}

export function listarAgrupaciones({ signal } = {}) {
  return solicitarAgrupaciones("", "No se pudieron cargar los grupos.", { signal });
}

export function agruparSolicitudes(solicitudes) {
  return solicitarAgrupaciones("", "No se pudieron agrupar las solicitudes.", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solicitudes }),
  });
}

export function deshacerAgrupacion(id) {
  return solicitarAgrupaciones(`/${encodeURIComponent(id)}/deshacer`, "No se pudo deshacer el grupo.", {
    method: "POST",
  });
}

// ABC-372: planificación de rutas sobre el contrato de ABC-371
// (services/logistica-service/src/rutas/README.md). Solo una ruta PLANIFICADA
// se puede editar y la edición reemplaza todas sus paradas.
const RUTAS = `${apiConfig.gatewayUrl}/api/logistica/rutas`;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function rutaConfirmada(ruta) {
  if (!ruta?.id || !ruta.estado || !Array.isArray(ruta.paradas)) {
    throw new Error("El servidor devolvió una ruta incompleta o inválida.");
  }
  return ruta;
}

// El formulario guarda vehículo y chofer como ids elegidos; la API usa *ExternoId.
function cuerpoRuta({ grupoId, fecha, vehiculo, chofer, paradas }) {
  return {
    grupoId: grupoId || null,
    fechaProgramada: fecha,
    vehiculoExternoId: vehiculo,
    choferExternoId: chofer,
    paradas: paradas.map((parada) => ({ destino: parada.destino.trim(), boletaIds: parada.boletaIds })),
  };
}

// Primer error de la ruta o "" si se puede enviar. `hoy` es YYYY-MM-DD.
export function validarRuta(datos, hoy) {
  if (!FECHA_ISO.test(datos.fecha ?? "")) return "Elige la fecha programada de la ruta.";
  if (datos.fecha < hoy) return "La fecha programada no puede ser anterior a hoy.";
  if (!datos.vehiculo) return "Elige un vehículo disponible para la ruta.";
  if (!datos.chofer) return "Elige un chofer disponible para la ruta.";
  if (!datos.paradas.length) return "Agrega al menos una parada.";
  const vistas = new Set();
  for (const [indice, parada] of datos.paradas.entries()) {
    const numero = indice + 1;
    if (!parada.destino.trim()) return `Indica el destino de la parada ${numero}.`;
    if (parada.destino.trim().length > 250) return `El destino de la parada ${numero} supera los 250 caracteres.`;
    if (!parada.boletaIds.length) return `Elige al menos una boleta para la parada ${numero}.`;
    for (const boletaId of parada.boletaIds) {
      if (vistas.has(boletaId)) return "Una boleta no puede estar en más de una parada.";
      vistas.add(boletaId);
    }
  }
  return "";
}

async function guardarRuta(url, metodo, datos, mensaje, signal) {
  const response = await fetch(url, {
    method: metodo,
    headers: { ...encabezados(), "Content-Type": "application/json" },
    body: JSON.stringify(cuerpoRuta(datos)),
    signal,
  });
  await exigirOk(response, mensaje);
  return rutaConfirmada(await response.json());
}

export function crearRuta(datos, { signal } = {}) {
  return guardarRuta(RUTAS, "POST", datos, "No se pudo guardar la ruta.", signal);
}

export function actualizarRuta(id, datos, { signal } = {}) {
  return guardarRuta(`${RUTAS}/${encodeURIComponent(id)}`, "PUT", datos, "No se pudo actualizar la ruta.", signal);
}

// Boletas EMITIDAS que ninguna ruta activa tiene. Con `rutaId` incluye también las
// de esa ruta, para editarla sin perderlas.
export async function listarBoletasDisponibles({ rutaId = null, signal } = {}) {
  const consulta = rutaId ? `?rutaId=${encodeURIComponent(rutaId)}` : "";
  const response = await fetch(`${RUTAS}/boletas-disponibles${consulta}`, { headers: encabezados(), signal });
  await exigirOk(response, "No se pudieron cargar las boletas disponibles.");
  const boletas = await response.json();
  if (!Array.isArray(boletas) || boletas.some((boleta) => !boleta?.id || !boleta.numero)) {
    throw new Error("El servidor devolvió un listado de boletas inválido.");
  }
  return boletas;
}

export async function listarRutas({ signal } = {}) {
  const response = await fetch(RUTAS, { headers: encabezados(), signal });
  await exigirOk(response, "No se pudieron cargar las rutas.");
  const rutas = await response.json();
  if (!Array.isArray(rutas)) throw new Error("El servidor devolvió un listado de rutas inválido.");
  return rutas.map(rutaConfirmada);
}
