import { useEffect, useState } from "react";
import { obtenerRecetas, crearReceta } from "../services/recetasService";

export default function RecetasPage() {
  const [recetas, setRecetas] = useState([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [formulario, setFormulario] = useState({
    producto_codigo: "",
    producto_nombre: "",
    activa: true,
  });

  async function cargarRecetas() {
    try {
      const datos = await obtenerRecetas();
      setRecetas(datos);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    cargarRecetas();
  }, []);

  async function guardarReceta() {
    await crearReceta(formulario);

    setFormulario({
      producto_codigo: "",
      producto_nombre: "",
      activa: true,
    });

    setMostrarFormulario(false);

    cargarRecetas();
  }

  return (
    <div>
      <h1>Recetas</h1>

      <p>
        Gestión de recetas de productos
      </p>

      <button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
        {mostrarFormulario ? "Cancelar" : "Nueva receta"}
      </button>

      {mostrarFormulario && (
        <div>
          <h2>Registrar receta</h2>

          <input
            placeholder="Código producto"
            value={formulario.producto_codigo}
            onChange={(e) =>
              setFormulario({
                ...formulario,
                producto_codigo: e.target.value,
              })
            }
          />

          <br /><br />

          <input
            placeholder="Nombre producto"
            value={formulario.producto_nombre}
            onChange={(e) =>
              setFormulario({
                ...formulario,
                producto_nombre: e.target.value,
              })
            }
          />

          <br /><br />

          <button onClick={guardarReceta}>
            Guardar receta
          </button>
        </div>
      )}

      <hr />

      <h2>Listado de recetas</h2>

      <table border="1">
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Estado</th>
          </tr>
        </thead>

        <tbody>
          {recetas.map((receta) => (
            <tr key={receta.id}>
              <td>{receta.producto_codigo}</td>
              <td>{receta.producto_nombre}</td>
              <td>
                {receta.activa ? "Activo" : "Inactivo"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}