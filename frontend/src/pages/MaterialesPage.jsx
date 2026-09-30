import { useEffect, useState } from "react";
import {
  actualizarMaterial,
  consultarDisponibilidad,
  crearMaterial,
  listarMateriales,
} from "../services/materiales";
import PageHeader from "../components/ui/PageHeader.jsx";

// Lógica intacta; solo cambia la presentación al sistema común (ts-*).
// Sin entrada en el menú: se gestiona desde Recetas y el detalle de la orden;
// la ruta /materiales sigue protegida y funcional.
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
    <section className="ts-page" aria-labelledby="materiales-titulo">
      <PageHeader
        titulo="Materiales"
        descripcion="Listado, creación y edición de materiales con su disponibilidad de inventario."
        conteo={!cargando && !error ? `${materiales.length} materiales` : null}
      />
      {mensaje && <p className="ts-success" role="status">{mensaje}</p>}
      {cargando && <p className="ts-feedback" role="status">Cargando materiales…</p>}
      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
        </div>
      )}

      {!cargando && !error && (
        <div className="ts-panel">
          <div className="ts-panel-title"><h2 id="materiales-titulo">Listado de materiales</h2><span>{materiales.length} resultados</span></div>
          {materiales.length === 0 ? (
            <p className="ts-empty">Todavía no hay materiales.</p>
          ) : (
            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Materiales e inventario</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Unidad</th>
                    <th scope="col">Disponible</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {materiales.map((m) => (
                    <tr key={m.id}>
                      <td className="ts-code">{m.codigo}</td>
                      <td>{m.nombre}</td>
                      <td>{m.unidadMedida ?? m.unidad_medida}</td>
                      <td>{disponibilidad[m.id]?.cantidadDisponible ?? "—"}</td>
                      <td className="ts-actions">
                        <button
                          type="button"
                          className="ts-btn"
                          aria-label={`Editar ${m.nombre}`}
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
            </div>
          )}
          <div style={{ padding: "4px 20px 16px" }}>
            <h3>{editando ? "Editar material" : "Nuevo material"}</h3>
            <form onSubmit={guardar}>
              <div className="ts-filters" style={{ padding: 0 }}>
                {!editando && (
                  <label htmlFor="material-codigo">Código *
                    <input id="material-codigo" placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                  </label>
                )}
                <label htmlFor="material-nombre">Nombre *
                  <input id="material-nombre" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                </label>
                <label htmlFor="material-unidad">Unidad (kg, unidad…) *
                  <input id="material-unidad" placeholder="Unidad (kg, unidad...)" value={form.unidadMedida} onChange={(e) => setForm({ ...form, unidadMedida: e.target.value })} />
                </label>
              </div>
              {errorForm && <p role="alert" className="ts-modal-error">{errorForm}</p>}
              <div className="ts-btn-group" style={{ marginTop: 10 }}>
                <button type="submit" className="ts-btn ts-btn-primary">Guardar</button>
                {editando && <button type="button" className="ts-btn" onClick={() => { setEditando(null); setForm({ codigo: "", nombre: "", unidadMedida: "" }); }}>Cancelar</button>}
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
