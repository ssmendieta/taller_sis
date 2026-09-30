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

const lineaVacia = { material_id: "", cantidad_requerida: "" };

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
    <div>
      <h1>Recetas</h1>
      <p>Gestión de recetas de productos y sus materiales.</p>
      <div>
        <button type="button" onClick={abrirCrear}>Nueva receta</button>
        <label>
          <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
          Ver inactivas (versiones anteriores)
        </label>
        <button type="button" onClick={cargar}>Reintentar</button>
      </div>

      {cargando && <p role="status">Cargando recetas…</p>}
      {error && <p role="alert">{error}</p>}
      {mensaje && <p role="status">{mensaje}</p>}

      {!cargando && !error && visibles.length === 0 && <p>Todavía no hay recetas.</p>}
      {!cargando && !error && visibles.length > 0 && (
        <table border="1">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Estado</th>
              <th>Materiales</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((receta) => (
              <tr key={receta.id}>
                <td>{receta.producto_codigo}</td>
                <td>{receta.producto_nombre}</td>
                <td>{receta.activa ? "Activa" : "Inactiva"}</td>
                <td>
                  {(receta.materiales ?? []).map((m) => (
                    <div key={m.material_id}>
                      {m.nombre ?? m.codigo ?? `Material ${m.material_id}`} — {m.cantidad_requerida} {m.unidad_medida ?? ""}
                    </div>
                  ))}
                </td>
                <td>
                  <button type="button" onClick={() => abrirEditar(receta)}>Editar</button>
                  {receta.activa && <button type="button" onClick={() => desactivar(receta)}>Desactivar</button>}
                  <button type="button" onClick={() => abrirVersion(receta)}>Nueva versión</button>
                  <button type="button" onClick={() => verVersiones(receta)}>Ver versiones</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mostrarFormulario && (
        <div>
          <h2>{versionando ? `Nueva versión de ${versionando.producto_codigo}` : editando ? "Editar receta" : "Registrar receta"}</h2>
          <form onSubmit={guardar}>
            {!editando && !versionando && (
              <input
                placeholder="Código producto"
                value={formulario.producto_codigo}
                onChange={(e) => setFormulario({ ...formulario, producto_codigo: e.target.value })}
              />
            )}
            <input
              placeholder="Nombre producto"
              value={formulario.producto_nombre}
              onChange={(e) => setFormulario({ ...formulario, producto_nombre: e.target.value })}
            />
            <h3>Materiales</h3>
            {lineas.map((linea, i) => (
              <div key={i}>
                <select value={linea.material_id} onChange={(e) => actualizarLinea(i, "material_id", e.target.value)}>
                  <option value="">Selecciona material</option>
                  {materiales.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  placeholder="Cantidad"
                  value={linea.cantidad_requerida}
                  onChange={(e) => actualizarLinea(i, "cantidad_requerida", e.target.value)}
                />
                <button type="button" onClick={() => setLineas((actual) => actual.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            ))}
            <button type="button" onClick={() => setLineas((actual) => [...actual, { ...lineaVacia }])}>Agregar línea</button>
            {errorForm && <p role="alert">{errorForm}</p>}
            <div>
              <button type="button" onClick={() => setMostrarFormulario(false)}>Cancelar</button>
              <button type="submit">Guardar</button>
            </div>
          </form>
        </div>
      )}

      {versiones && (
        <div>
          <h2>Versiones de {versiones.receta.producto_codigo}</h2>
          <ul>
            {(versiones.lista ?? []).map((v) => (
              <li key={v.id}>
                v{v.id} — {v.producto_nombre} — {v.activa ? "activa" : "inactiva"} — {(v.materiales ?? []).length} materiales
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setVersiones(null)}>Cerrar</button>
        </div>
      )}
    </div>
  );
}
