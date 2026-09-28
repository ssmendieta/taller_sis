import { apiConfig } from "./api";


export async function obtenerOrdenes() {

  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/buscar`
  );


  if (!response.ok) {
    throw new Error("Error al obtener órdenes");
  }


  return await response.json();

}



export async function obtenerOrden(id) {

  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}`
  );


  if (!response.ok) {
    throw new Error("Error al obtener detalle de orden");
  }


  return await response.json();

}



export async function obtenerMaterialesOrden(id) {

  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}/materiales`
  );


  if (!response.ok) {
    throw new Error("Error al obtener materiales");
  }


  return await response.json();

}



export async function obtenerHistorialOrden(id) {

  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}/historial`
  );


  if (!response.ok) {
    throw new Error("Error al obtener historial");
  }


  return await response.json();

}