import { useEffect, useRef, useState } from "react";
import {
  actualizarMaterial,
  consultarDisponibilidad,
  crearMaterial,
  listarMateriales,
} from "../services/materiales";
import { obtenerUnidades } from "../services/unidades.js";
import { formatearCantidad } from "../utils/format.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import Paginacion, { paginar, totalPaginas } from "../components/ui/Paginacion.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// Materiales (ruta /materiales, sin entrada en el menú: se gestiona desde
// Recetas y el detalle de la orden). Unidad con select del catálogo.
export default function MaterialesPage() {
  const [materiales, setMateriales] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorForm, setErrorForm] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", unidadMedida: "unidad" });
  const [editando, setEditando] = useState(null);
  const [pagina, setPagina] = useState(1);
  const primerCampo = useRef(null);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const [datos, catalogo] = await Promise.all([listarMateriales(), obtenerUnidades()]);
      const lista = Array.isArray(datos) ? datos : [];
      setMateriales(lista);
      setUnidades(Array.isArray(catalogo) ? catalogo : []);
      const mapa = {};
      for (const m of lista) {
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

  useEffect(() => { document.title = FORMATO_TITULO("Materiales"); }, []);

  function unidadDe(m) {
    return m.unidadMedida ?? m.unidad_medida ?? "unidad";
  }

  async function guardar(event) {
    event.preventDefault();
    if (guardando) return;
    setErrorForm("");
    setMensaje("");
    try {
      if (editando) {
        if (!form.nombre.trim()) {
          setErrorForm("El nombre es obligatorio.");
          return;
        }
        if (!form.unidadMedida) {
          setErrorForm("La unidad es obligatoria.");
          return;
        }
        setGuardando(true);
        await actualizarMaterial(editando.id, {
          nombre: form.nombre.trim(),
          unidadMedida: form.unidadMedida,
        });
        setMensaje("Material actualizado.");
      } else {
        if (!form.codigo.trim() || !form.nombre.trim() || !form.unidadMedida) {
          setErrorForm("El código, el nombre y la unidad son obligatorios.");
          return;
        }
        setGuardando(true);
        await crearMaterial({
          codigo: form.codigo.trim(),
          nombre: form.nombre.trim(),
          unidadMedida: form.unidadMedida,
        });
        setMensaje("Material creado.");
      }
      setForm({ codigo: "", nombre: "", unidadMedida: "unidad" });
      setEditando(null);
      setPagina(1);
      await cargar();
    } catch (e) {
      setErrorForm(e.message || "No se pudo guardar el material.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="ts-page" aria-labelledby="materiales-titulo">
      <PageHeader
        titulo="Materiales"
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
          <div className="ts-panel-title"><h2 id="materiales-titulo">Listado</h2><span>{materiales.length} resultados</span></div>
          {materiales.length === 0 ? (
            <p className="ts-empty">Sin materiales.</p>
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
                  {paginar(materiales, pagina).map((m) => (
                    <tr key={m.id}>
                      <td className="ts-code">{m.codigo}</td>
                      <td>{m.nombre}</td>
                      <td>{unidadDe(m)}</td>
                      <td>{disponibilidad[m.id] ? formatearCantidad(disponibilidad[m.id]?.cantidadDisponible, unidadDe(m)) : "—"}</td>
                      <td className="ts-actions">
                        <button
                          type="button"
                          className="ts-btn ts-btn--sm"
                          aria-label={`Editar ${m.nombre}`}
                          onClick={() => {
                            setEditando(m);
                            setForm({ codigo: m.codigo, nombre: m.nombre, unidadMedida: unidadDe(m) });
                            setErrorForm("");
                            setMensaje("");
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
          <Paginacion pagina={pagina} total={totalPaginas(materiales)} alCambiar={setPagina} etiqueta="Paginación de materiales" />
          <div style={{ padding: "4px 20px 16px" }}>
            <h3>{editando ? "Editar material" : "Nuevo material"}</h3>
            <form onSubmit={guardar}>
              <div className="ts-filters" style={{ padding: 0 }}>
                {!editando && (
                  <label htmlFor="material-codigo">Código *
                    <input ref={primerCampo} id="material-codigo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} disabled={guardando} placeholder="p. ej. MAT-001" />
                  </label>
                )}
                <label htmlFor="material-nombre">Nombre *
                  <input id="material-nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} disabled={guardando} placeholder="p. ej. Harina" />
                </label>
                <label htmlFor="material-unidad">Unidad *
                  <select id="material-unidad" value={form.unidadMedida} onChange={(e) => setForm({ ...form, unidadMedida: e.target.value })} disabled={guardando}>
                    <option value="">Selecciona una unidad</option>
                    {unidades.map((u) => (
                      <option key={u.codigo} value={u.codigo}>{u.nombre} ({u.simbolo})</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="ts-field-help">La unidad no se puede cambiar después.</p>
              {errorForm && <p role="alert" className="ts-modal-error">{errorForm}</p>}
              <div className="ts-btn-group ts-btn-group--end" style={{ marginTop: 10 }}>
                {editando && <button type="button" className="ts-btn" disabled={guardando} onClick={() => { setEditando(null); setForm({ codigo: "", nombre: "", unidadMedida: "unidad" }); setErrorForm(""); }}>Cancelar</button>}
                <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
