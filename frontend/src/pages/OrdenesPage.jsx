import { useEffect, useState } from "react";
import { obtenerOrdenes } from "../services/ordenesService";


export default function OrdenesPage() {

  const [ordenes, setOrdenes] = useState([]);


  async function cargarOrdenes() {

    try {

      const datos = await obtenerOrdenes();

      setOrdenes(datos);

    } catch (error) {

      console.error(error);

    }

  }


  useEffect(() => {

    cargarOrdenes();

  }, []);



  return (

    <div>

      <h1>Órdenes de Producción</h1>

      <p>
        Gestión de órdenes de producción
      </p>


      <hr />


      <h2>Listado de órdenes</h2>


      <table border="1">

        <thead>

          <tr>

            <th>Código</th>

            <th>Fecha programada</th>

            <th>Cantidad</th>

            <th>Estado</th>

          </tr>

        </thead>


        <tbody>

          {ordenes.map((orden) => (

            <tr key={orden.id}>

              <td>
                {orden.codigo}
              </td>


              <td>
                {orden.fechaProgramada}
              </td>


              <td>
                {orden.cantidadSolicitada}
              </td>


              <td>
                {orden.estado}
              </td>


            </tr>

          ))}


        </tbody>


      </table>


    </div>

  );

}