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

async function exigirOk(response, mensaje) {
  if (!response.ok) {
    const datos = await response.json().catch(() => null);
    const detalle = datos?.message;
    throw new Error(
      (Array.isArray(detalle) ? detalle.join(". ") : detalle) || mensaje
    );
  }
  return response;
}

// La ruta conserva el nombre "conformes" por compatibilidad con ABC-82;
// el mismo endpoint registra y consulta defectuosos con `tipo`.
const BASE = `${apiConfig.gatewayUrl}/api/produccion/calidad/conformes`;

export const TIPO_CONFORME = "CONFORME";
export const TIPO_DEFECTUOSO = "DEFECTUOSO";
export const MAX_CAUSA_DEFECTO = 500;

export async function listarResultadosCalidad(ordenId, tipo = TIPO_CONFORME) {
  const params = new URLSearchParams({ tipo });
  const response = await fetch(`${BASE}/orden/${ordenId}?${params}`, {
    headers: encabezados(),
  });

  await exigirOk(response, "No se pudieron cargar los resultados de calidad.");
  return response.json();
}

export async function registrarDefecto({ ordenId, cantidad, causaDefecto }) {
  const response = await fetch(BASE, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      ordenId,
      cantidad,
      tipo: TIPO_DEFECTUOSO,
      causaDefecto,
    }),
  });

  await exigirOk(response, "No se pudo registrar el defecto.");
  return response.json();
}

// La API devuelve cantidades como texto con cuatro decimales; se suman en
// diezmilésimas enteras para no arrastrar errores de coma flotante.
function aDiezmilesimas(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 10000) : 0;
}

export function sumarCantidades(registros) {
  const lista = Array.isArray(registros) ? registros : [];
  return lista.reduce((suma, r) => suma + aDiezmilesimas(r.cantidad), 0) / 10000;
}

export function resumenCalidad(producido, conformes, defectuosos) {
  const totalConformes = sumarCantidades(conformes);
  const totalDefectuosos = sumarCantidades(defectuosos);
  const porClasificar =
    (aDiezmilesimas(producido) -
      aDiezmilesimas(totalConformes) -
      aDiezmilesimas(totalDefectuosos)) /
    10000;

  return {
    producido: Number(producido) || 0,
    conformes: totalConformes,
    defectuosos: totalDefectuosos,
    porClasificar: Math.max(porClasificar, 0),
  };
}
