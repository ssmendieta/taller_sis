import { useEffect, useState } from "react";

import {
  obtenerOrdenes,
  registrarAvance,
  obtenerTotalProducido,
} from "../services/ordenesService";


export default function OrdenesPage() {


  const [ordenes, setOrdenes] = useState([]);

  const [cantidades, setCantidades] = useState({});

  const [totales, setTotales] = useState({});




  async function cargarOrdenes() {

    try {


      const datos = await obtenerOrdenes();


      console.log(
        "ORDENES RECIBIDAS:",
        datos
      );



      setOrdenes(datos);



      datos.forEach((orden)=>{

        cargarTotal(
          orden.id
        );

      });



    } catch(error) {


      console.error(
        "ERROR CARGANDO ORDENES:",
        error
      );


    }


  }







  async function cargarTotal(id) {


    try {


      const total =
        await obtenerTotalProducido(id);



      console.log(
        "TOTAL PRODUCIDO:",
        id,
        total
      );



      setTotales((prev)=>({


        ...prev,


        [id]: total,


      }));



    } catch(error) {


      console.error(
        "ERROR TOTAL:",
        error
      );


    }


  }








  async function guardarAvance(id) {


    const cantidad =
      cantidades[id];



    console.log(
      "CLICK AVANCE:",
      {
        orden:id,
        cantidad
      }
    );



    if(!cantidad || Number(cantidad)<=0){


      alert(
        "Ingrese una cantidad válida"
      );


      return;


    }







    try {


      const respuesta =
        await registrarAvance(

          id,

          Number(cantidad)

        );



      console.log(
        "AVANCE REGISTRADO:",
        respuesta
      );



      setCantidades((prev)=>({


        ...prev,


        [id]:"",


      }));



      await cargarTotal(id);



      alert(
        "Avance registrado correctamente"
      );



    } catch(error) {


      console.error(
        "ERROR REGISTRANDO AVANCE:",
        error
      );



      alert(
        "Error al registrar avance"
      );


    }


  }







  useEffect(()=>{


    cargarOrdenes();


  },[]);








  return (

    <div>


      <h1>
        Órdenes de Producción
      </h1>


      <p>
        Gestión de órdenes de producción
      </p>


      <hr />


      <h2>
        Listado de órdenes
      </h2>





      <table border="1">


        <thead>


          <tr>


            <th>
              Código
            </th>


            <th>
              Fecha programada
            </th>


            <th>
              Cantidad
            </th>


            <th>
              Estado
            </th>


            <th>
              Avance
            </th>


          </tr>


        </thead>





        <tbody>


        {
          ordenes.map((orden)=>(


            <tr key={orden.id}>


              <td>
                {orden.codigo}
              </td>



              <td>
                {orden.fecha_programada ?? orden.fechaProgramada}
              </td>



              <td>
                {orden.cantidad_solicitada ?? orden.cantidadSolicitada}
              </td>



              <td>
                {orden.estado}
              </td>





              <td>


                <p>

                  Total producido:

                  {" "}

                  {totales[orden.id] ?? 0}


                </p>






                {
                  orden.estado === "EN_PRODUCCION"

                  ?

                  <>


                    <input

                      type="number"

                      placeholder="Cantidad"


                      value={
                        cantidades[orden.id] || ""
                      }



                      onChange={(e)=>{


                        setCantidades({

                          ...cantidades,

                          [orden.id]:
                            e.target.value

                        });


                      }}



                    />





                    <button

                      type="button"

                      onClick={()=>guardarAvance(orden.id)}

                    >

                      Registrar avance

                    </button>



                  </>


                  :

                  <p>
                    No disponible en estado {orden.estado}
                  </p>


                }



              </td>



            </tr>


          ))

        }



        </tbody>



      </table>



    </div>

  );


}