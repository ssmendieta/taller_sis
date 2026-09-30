import { apiConfig } from "./api";

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

export async function obtenerRecetas(soloActivas) {
  const params = soloActivas === undefined ? "" : `?activa=${soloActivas ? "true" : "false"}`;
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/recetas${params}`,
    { headers: encabezados() },
  );
  await exigirOk(response, "No se pudieron cargar las recetas.");
  return response.json();
}

export async function crearReceta(receta) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/recetas`,
    {
      method: "POST",
      headers: encabezados({ "Content-Type": "application/json" }),
      body: JSON.stringify(receta),
    }
  );

  await exigirOk(response, "No se pudo crear la receta.");
  return response.json();
}

export async function actualizarReceta(id, cambios) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/recetas/${id}`,
    {
      method: "PATCH",
      headers: encabezados({ "Content-Type": "application/json" }),
      body: JSON.stringify(cambios),
    }
  );

  await exigirOk(response, "No se pudo actualizar la receta.");
  return response.json();
}

export async function desactivarReceta(id) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/recetas/${id}/desactivar`,
    { method: "PATCH", headers: encabezados() }
  );

  await exigirOk(response, "No se pudo desactivar la receta.");
  return response.json();
}

export async function crearVersionReceta(id, datos) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/recetas/${id}/versiones`,
    {
      method: "POST",
      headers: encabezados({ "Content-Type": "application/json" }),
      body: JSON.stringify(datos),
    }
  );

  await exigirOk(response, "No se pudo crear la nueva versión.");
  return response.json();
}

export async function listarVersionesReceta(id) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/recetas/${id}/versiones`,
    { headers: encabezados() }
  );

  await exigirOk(response, "No se pudieron cargar las versiones.");
  return response.json();
}
