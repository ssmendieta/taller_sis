import { useEffect, useState } from "react";
import {
  actualizarMaterial,
  consultarDisponibilidad,
  crearMaterial,
  listarMateriales,
} from "../services/materiales";

export default function MaterialesPage() {
  const [materiales, setMateriales] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorForm, setErrorForm] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [form, setForm] = useState({ codigo: "", nombre: "", unidadMedida: "" });
  const [editando, setEditando] = useState(null);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const datos = await listarMateriales();
      setMateriales(Array.isArray(datos) ? datos : []);
      const mapa = {};
      for (const m of Array.isArray(datos) ? datos : []) {
        try {
          mapa[m.id] = await consultarDisponibilidad(m.id);
        } catch {
          mapa[m.id] = { cantidadDisponible: 0, disponible: false };
        }
      }
      setDisponibilidad(mapa);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function guardar(event) {
    event.preventDefault();
    setErrorForm("");
    try {
      if (editando) {
        await actualizarMaterial(editando.id, {
          ...(form.nombre.trim() ? { nombre: form.nombre.trim() } : {}),
          ...(form.unidadMedida.trim() ? { unidadMedida: form.unidadMedida.trim() } : {}),
        });
        setMensaje("Material actualizado.");
      } else {
        if (!form.codigo.trim() || !form.nombre.trim() || !form.unidadMedida.trim()) {
          setErrorForm("Código, nombre y unidad son obligatorios.");
          return;
        }
        await crearMaterial({
          codigo: form.codigo.trim(),
          nombre: form.nombre.trim(),
          unidadMedida: form.unidadMedida.trim(),
        });
        setMensaje("Material creado.");
      }
      setForm({ codigo: "", nombre: "", unidadMedida: "" });
      setEditando(null);
      await cargar();
    } catch (e) {
      setErrorForm(e.message);
    }
  }

  return (
    <div>
      <h1>Materiales</h1>
      <p>Listado, creación y edición de materiales con su disponibilidad de inventario.</p>
      <button type="button" onClick={cargar}>Reintentar</button>
      {cargando && <p role="status">Cargando materiales…</p>}
      {error && <p role="alert">{error}</p>}
      {mensaje && <p role="status">{mensaje}</p>}

      {!cargando && !error && materiales.length === 0 && <p>Todavía no hay materiales.</p>}
      {!cargando && !error && materiales.length > 0 && (
        <table border="1">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Unidad</th>
              <th>Disponible</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {materiales.map((m) => (
              <tr key={m.id}>
                <td>{m.codigo}</td>
                <td>{m.nombre}</td>
                <td>{m.unidadMedida ?? m.unidad_medida}</td>
                <td>{disponibilidad[m.id]?.cantidadDisponible ?? "—"}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(m);
                      setForm({ codigo: m.codigo, nombre: m.nombre, unidadMedida: m.unidadMedida ?? m.unidad_medida ?? "" });
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{editando ? "Editar material" : "Nuevo material"}</h2>
      <form onSubmit={guardar}>
        {!editando && (
          <input placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
        )}
        <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input placeholder="Unidad (kg, unidad...)" value={form.unidadMedida} onChange={(e) => setForm({ ...form, unidadMedida: e.target.value })} />
        {errorForm && <p role="alert">{errorForm}</p>}
        <button type="submit">Guardar</button>
        {editando && <button type="button" onClick={() => { setEditando(null); setForm({ codigo: "", nombre: "", unidadMedida: "" }); }}>Cancelar</button>}
      </form>
    </div>
  );
}
