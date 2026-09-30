import { useEffect, useState } from "react";
import {
  actualizarReceta,
  crearReceta,
  crearVersionReceta,
  desactivarReceta,
  listarVersionesReceta,
  obtenerRecetas,
} from "../services/recetasService";
import { listarMateriales } from "../services/materiales";
import PageHeader from "../components/ui/PageHeader.jsx";
import { BadgeActivo } from "../components/ui/Badges.jsx";

const lineaVacia = { material_id: "", cantidad_requerida: "" };

// Lógica intacta; solo cambia la presentación al sistema común (ts-*).
export default function RecetasPage() {
  const [recetas, setRecetas] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [errorForm, setErrorForm] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [verInactivas, setVerInactivas] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState(null);
  const [versionando, setVersionando] = useState(null);
  const [versiones, setVersiones] = useState(null);

  const [formulario, setFormulario] = useState({
    producto_codigo: "",
    producto_nombre: "",
  });
  const [lineas, setLineas] = useState([{ ...lineaVacia }]);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const [datosRecetas, datosMateriales] = await Promise.all([
        obtenerRecetas(),
        listarMateriales(),
      ]);
      setRecetas(Array.isArray(datosRecetas) ? datosRecetas : []);
      setMateriales(Array.isArray(datosMateriales) ? datosMateriales : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function abrirCrear() {
    setEditando(null);
    setVersionando(null);
    setFormulario({ producto_codigo: "", producto_nombre: "" });
    setLineas([{ ...lineaVacia }]);
    setErrorForm("");
    setMostrarFormulario(true);
  }

  function abrirEditar(receta) {
    setVersionando(null);
    setEditando(receta);
    setFormulario({ producto_codigo: receta.producto_codigo, producto_nombre: receta.producto_nombre });
    setLineas(
      (receta.materiales ?? []).map((m) => ({
        material_id: String(m.material_id),
        cantidad_requerida: String(m.cantidad_requerida),
      })),
    );
    setErrorForm("");
    setMostrarFormulario(true);
  }

  function abrirVersion(receta) {
    setEditando(null);
    setVersionando(receta);
    setFormulario({ producto_codigo: receta.producto_codigo, producto_nombre: receta.producto_nombre });
    setLineas(
      (receta.materiales ?? []).map((m) => ({
        material_id: String(m.material_id),
        cantidad_requerida: String(m.cantidad_requerida),
      })),
    );
    setErrorForm("");
    setMostrarFormulario(true);
  }

  function actualizarLinea(indice, campo, valor) {
    setLineas((actual) => actual.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  }

  function lineasValidas() {
    const lista = lineas
      .filter((l) => l.material_id !== "" || l.cantidad_requerida !== "")
      .map((l) => ({
        material_id: Number(l.material_id),
        cantidad_requerida: Number(l.cantidad_requerida),
      }));
    for (const l of lista) {
      if (!Number.isInteger(l.material_id) || l.material_id < 1) return null;
      if (!Number.isFinite(l.cantidad_requerida) || l.cantidad_requerida <= 0) return null;
    }
    return lista;
  }

  async function guardar(event) {
    event.preventDefault();
    setErrorForm("");
    const lista = lineasValidas();
    if (lista === null) {
      setErrorForm("Revisa las líneas: material válido y cantidad mayor a cero.");
      return;
    }
    try {
      if (versionando) {
        await crearVersionReceta(versionando.id, {
          producto_nombre: formulario.producto_nombre.trim(),
          materiales: lista.map((l) => ({ material_id: l.material_id, cantidad_requerida: l.cantidad_requerida })),
        });
        setMensaje(`Nueva versión creada para ${versionando.producto_codigo}.`);
      } else if (editando) {
        await actualizarReceta(editando.id, {
          producto_nombre: formulario.producto_nombre.trim(),
          ...(lista.length ? { materiales: lista.map((l) => ({ material_id: l.material_id, cantidad_requerida: l.cantidad_requerida })) } : {}),
        });
        setMensaje(`Receta ${editando.producto_codigo} actualizada.`);
      } else {
        if (!formulario.producto_codigo.trim() || !formulario.producto_nombre.trim()) {
          setErrorForm("El código y el nombre del producto son obligatorios.");
          return;
        }
        await crearReceta({
          producto_codigo: formulario.producto_codigo.trim(),
          producto_nombre: formulario.producto_nombre.trim(),
          materiales: lista.map((l) => ({ material_id: l.material_id, cantidad_requerida: l.cantidad_requerida })),
        });
        setMensaje("Receta creada correctamente.");
      }
      setMostrarFormulario(false);
      await cargar();
    } catch (e) {
      setErrorForm(e.message);
    }
  }

  async function desactivar(receta) {
    setError("");
    try {
      await desactivarReceta(receta.id);
      setMensaje(`Receta ${receta.producto_codigo} desactivada.`);
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function verVersiones(receta) {
    setError("");
    try {
      setVersiones({ receta, lista: await listarVersionesReceta(receta.id) });
    } catch (e) {
      setError(e.message);
    }
  }

  const visibles = recetas.filter((r) => (verInactivas ? true : r.activa));

  return (
    <section className="ts-page" aria-labelledby="recetas-titulo">
      <PageHeader
        titulo="Recetas"
        descripcion="Gestión de recetas de productos y sus materiales."
        conteo={!cargando && !error ? `${visibles.length} recetas` : null}
        accion={<button type="button" className="ts-btn ts-btn-primary" onClick={abrirCrear}>+ Nueva receta</button>}
      />

      {mensaje && <p className="ts-success" role="status">{mensaje}</p>}
      {cargando && <p className="ts-feedback" role="status">Cargando recetas…</p>}
      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
        </div>
      )}

      {!cargando && !error && (
        <div className="ts-panel">
          <div className="ts-panel-title"><h2 id="recetas-titulo">Listado de recetas</h2><span>{visibles.length} resultados</span></div>
          <div className="ts-filters">
            <label htmlFor="recetas-ver-inactivas" style={{ flex: "0 0 auto", flexDirection: "row", alignItems: "center" }}>
              <input id="recetas-ver-inactivas" type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
              Ver inactivas (versiones anteriores)
            </label>
          </div>
          {visibles.length === 0 ? (
            <p className="ts-empty">Todavía no hay recetas.</p>
          ) : (
            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Recetas de productos</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Materiales</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((receta) => (
                    <tr key={receta.id}>
                      <td className="ts-code">{receta.producto_codigo}</td>
                      <td>{receta.producto_nombre}</td>
                      <td><BadgeActivo activo={receta.activa} /></td>
                      <td>
                        {(receta.materiales ?? []).map((m) => (
                          <div key={m.material_id}>
                            {m.nombre ?? m.codigo ?? `Material ${m.material_id}`} — {m.cantidad_requerida} {m.unidad_medida ?? ""}
                          </div>
                        ))}
                      </td>
                      <td className="ts-actions">
                        <button type="button" className="ts-btn" onClick={() => abrirEditar(receta)}>Editar</button>
                        {receta.activa && <button type="button" className="ts-btn" onClick={() => desactivar(receta)}>Desactivar</button>}
                        <button type="button" className="ts-btn" onClick={() => abrirVersion(receta)}>Nueva versión</button>
                        <button type="button" className="ts-btn" onClick={() => verVersiones(receta)}>Ver versiones</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {mostrarFormulario && (
        <div className="ts-modal-overlay">
          <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="receta-form-titulo">
            <h2 id="receta-form-titulo">{versionando ? `Nueva versión de ${versionando.producto_codigo}` : editando ? "Editar receta" : "Registrar receta"}</h2>
            <form onSubmit={guardar}>
              {!editando && !versionando && (
                <label htmlFor="receta-codigo">Código de producto *
                  <input
                    id="receta-codigo"
                    placeholder="Código producto"
                    value={formulario.producto_codigo}
                    onChange={(e) => setFormulario({ ...formulario, producto_codigo: e.target.value })}
                  />
                </label>
              )}
              <label htmlFor="receta-nombre">Nombre de producto *
                <input
                  id="receta-nombre"
                  placeholder="Nombre producto"
                  value={formulario.producto_nombre}
                  onChange={(e) => setFormulario({ ...formulario, producto_nombre: e.target.value })}
                />
              </label>
              <h3>Materiales</h3>
              {lineas.map((linea, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <label style={{ flex: 2 }}>Material
                    <select value={linea.material_id} onChange={(e) => actualizarLinea(i, "material_id", e.target.value)}>
                      <option value="">Selecciona material</option>
                      {materiales.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>Cantidad
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      placeholder="Cantidad"
                      value={linea.cantidad_requerida}
                      onChange={(e) => actualizarLinea(i, "cantidad_requerida", e.target.value)}
                    />
                  </label>
                  <button type="button" className="ts-btn" onClick={() => setLineas((actual) => actual.filter((_, j) => j !== i))}>Quitar</button>
                </div>
              ))}
              <button type="button" className="ts-btn" onClick={() => setLineas((actual) => [...actual, { ...lineaVacia }])}>Agregar línea</button>
              {errorForm && <p role="alert" className="ts-modal-error">{errorForm}</p>}
              <div className="ts-modal-actions">
                <button type="button" className="ts-btn" onClick={() => setMostrarFormulario(false)}>Cancelar</button>
                <button type="submit" className="ts-btn ts-btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {versiones && (
        <div className="ts-modal-overlay">
          <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="receta-versiones-titulo">
            <h2 id="receta-versiones-titulo">Versiones de {versiones.receta.producto_codigo}</h2>
            <ul>
              {(versiones.lista ?? []).map((v) => (
                <li key={v.id}>
                  v{v.id} — {v.producto_nombre} — {v.activa ? "activa" : "inactiva"} — {(v.materiales ?? []).length} materiales
                </li>
              ))}
            </ul>
            <div className="ts-modal-actions">
              <button type="button" className="ts-btn" onClick={() => setVersiones(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
