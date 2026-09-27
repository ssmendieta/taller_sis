import { apiConfig } from "./api";

export async function obtenerRecetas() {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/recetas`
  );

  if (!response.ok) {
    throw new Error("Error al obtener recetas");
  }

  return await response.json();
}


export async function crearReceta(receta) {
  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/recetas`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(receta),
    }
  );

  if (!response.ok) {
    throw new Error("Error al crear receta");
  }

  return await response.json();
}
