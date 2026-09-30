import { apiConfig } from "./api.js";

function encabezados(extra = {}) {
  const token = sessionStorage.getItem("accessToken");
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function exigirOk(response, mensaje) {
  if (!response.ok) {
    const datos = await response.json().catch(() => null);
    const posible = datos?.message;
    throw new Error(
      (Array.isArray(posible) ? posible.join(". ") : posible) || mensaje,
    );
  }
  return response;
}

export async function listarMateriales() {
  const response = await fetch(`${apiConfig.gatewayUrl}/api/produccion/materiales`, {
    headers: encabezados(),
  });
  await exigirOk(response, "No se pudieron cargar los materiales.");
  return response.json();
}

export async function crearMaterial(datos) {
  const response = await fetch(`${apiConfig.gatewayUrl}/api/produccion/materiales`, {
    method: "POST",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify(datos),
  });
  await exigirOk(response, "No se pudo crear el material.");
  return response.json();
}

export async function actualizarMaterial(id, datos) {
  const response = await fetch(`${apiConfig.gatewayUrl}/api/produccion/materiales/${id}`, {
    method: "PUT",
    headers: encabezados({ "Content-Type": "application/json" }),
    body: JSON.stringify(datos),
  });
  await exigirOk(response, "No se pudo actualizar el material.");
  return response.json();
}

export async function consultarDisponibilidad(materialId) {
  const response = await fetch(
    `${apiConfig.gatewayUrl}/api/produccion/inventario/material/${materialId}`,
    { headers: encabezados() },
  );
  await exigirOk(response, "No se pudo consultar la disponibilidad.");
  return response.json();
}
