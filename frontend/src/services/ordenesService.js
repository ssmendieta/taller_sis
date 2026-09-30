import { apiConfig } from "./api";


// ================================
// ORDENES
// ================================

export async function obtenerOrdenes() {


  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/buscar`
  );


  if (!response.ok) {

    throw new Error(
      "Error al obtener órdenes"
    );

  }


  const datos = await response.json();


  console.log(
    "SERVICE ORDENES:",
    datos
  );


  return Array.isArray(datos)
    ? datos
    : [datos];

}




export async function obtenerOrden(id) {


  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}`
  );


  if (!response.ok) {

    throw new Error(
      "Error al obtener detalle de orden"
    );

  }


  return await response.json();

}




export async function obtenerMaterialesOrden(id) {


  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}/materiales`
  );


  if (!response.ok) {

    throw new Error(
      "Error al obtener materiales"
    );

  }


  return await response.json();

}




export async function obtenerHistorialOrden(id) {


  const response = await fetch(
    `${apiConfig.apiUrl}/api/produccion/ordenes/${id}/historial`
  );


  if (!response.ok) {

    throw new Error(
      "Error al obtener historial"
    );

  }


  return await response.json();

}





// ================================
// ABC-196 AVANCES
// ================================


export async function registrarAvance(
  ordenId,
  cantidad
) {


  console.log(
    "ENVIANDO AVANCE:",
    {
      ordenId,
      cantidad
    }
  );


  const token = sessionStorage.getItem("accessToken");

  const response = await fetch(

    `${apiConfig.apiUrl}/api/produccion/avances/${ordenId}`,

    {

      method:"POST",

      headers:{

        "Content-Type":"application/json",

        ...(token ? { Authorization: `Bearer ${token}` } : {})

      },


      body:JSON.stringify({

        cantidad:Number(cantidad),

        usuario_id:1

      })

    }

  );



  console.log(
    "STATUS AVANCE:",
    response.status
  );



  const texto = await response.text();


  console.log(
    "RESPUESTA AVANCE:",
    texto
  );



  if(!response.ok){

    throw new Error(texto);

  }



  return JSON.parse(texto);


}





export async function obtenerAvancesOrden(
  ordenId
) {


  const response = await fetch(

    `${apiConfig.apiUrl}/api/produccion/avances/${ordenId}`

  );



  if(!response.ok){

    throw new Error(
      "Error al obtener avances"
    );

  }



  return await response.json();


}




export async function obtenerTotalProducido(
  ordenId
) {


  const response = await fetch(

    `${apiConfig.apiUrl}/api/produccion/avances/${ordenId}/total`

  );



  if(!response.ok){

    throw new Error(
      "Error al obtener total producido"
    );

  }



  return await response.json();


}