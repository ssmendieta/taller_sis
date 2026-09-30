import { apiConfig } from "./api";

function encabezados(extra = {}) {
  const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function exigirOk(response, mensaje) {
  if (!response.ok) {
    const texto = await response.text().catch(() => "");
    let detalle = mensaje;
    try {
      const datos = texto ? JSON.parse(texto) : null;
      const posible = datos?.message;
      detalle = Array.isArray(posible) ? posible.join(". ") : posible || mensaje;
    } catch {
      if (texto) detalle = texto;
    }
    throw new Error(detalle);
  }
  return response;
}


// ================================
// ORDENES
// ================================

export async function obtenerOrdenes() {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/buscar`,
    { headers: encabezados() }
  );

  await exigirOk(response, "Error al obtener órdenes");

  const datos = await response.json();

  return Array.isArray(datos)
    ? datos
    : [datos];
}




export async function obtenerOrden(id) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}`,
    { headers: encabezados() }
  );

  await exigirOk(response, "Error al obtener detalle de orden");

  return await response.json();
}




export async function obtenerMaterialesOrden(id) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}/materiales`,
    { headers: encabezados() }
  );

  await exigirOk(response, "Error al obtener materiales");

  return await response.json();
}




export async function obtenerHistorialOrden(id) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}/historial`,
    { headers: encabezados() }
  );

  await exigirOk(response, "Error al obtener historial");

  return await response.json();
}




// ================================
// ABC-196 AVANCES
// ================================


export async function registrarAvance(
  ordenId,
  cantidad
) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/avances/${ordenId}`,
    {
      method: "POST",
      headers: encabezados({ "Content-Type": "application/json" }),
      body: JSON.stringify({ cantidad: Number(cantidad) })
    }
  );

  await exigirOk(response, "No se pudo registrar el avance.");

  return response.json();
}




export async function obtenerAvancesOrden(
  ordenId
) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/avances/${ordenId}`,
    { headers: encabezados() }
  );

  await exigirOk(response, "Error al obtener avances");

  return await response.json();
}




export async function obtenerTotalProducido(
  ordenId
) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/avances/${ordenId}/total`,
    { headers: encabezados() }
  );

  await exigirOk(response, "Error al obtener total producido");

  return await response.json();
}
