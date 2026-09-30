import { useEffect, useMemo, useRef, useState } from "react";
import {
  actualizarReceta,
  crearReceta,
  crearVersionReceta,
  desactivarReceta,
  listarVersionesReceta,
  obtenerRecetas,
} from "../services/recetasService";
import { crearMaterial, listarMateriales } from "../services/materiales";
import { obtenerOrdenes } from "../services/ordenesService.js";
import { obtenerUnidades } from "../services/unidades.js";
import { tienePermiso } from "../services/permisos.js";
import { useSesion } from "../context/SesionContext.jsx";
import { formatearCantidad, formatearFechaHora, mensajeHumano } from "../utils/format.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { BadgeActivo } from "../components/ui/Badges.jsx";
import Paginacion, { paginar, totalPaginas } from "../components/ui/Paginacion.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

const lineaVacia = { material_id: "", cantidad_requerida: "" };

function unidadDeMaterial(materiales, id) {
  const m = materiales.find((x) => String(x.id) === String(id));
  return m?.unidadMedida ?? m?.unidad_medida ?? "";
}

export default function RecetasPage() {
  const { usuario } = useSesion();
  const [recetas, setRecetas] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [erroresCampo, setErroresCampo] = useState({});
  const [errorForm, setErrorForm] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [avisoFlotante, setAvisoFlotante] = useState("");
  const [pagina, setPagina] = useState(1);
  const [verInactivas, setVerInactivas] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [versionando, setVersionando] = useState(null);
  const [versiones, setVersiones] = useState(null);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(null);
  const [busquedaMaterial, setBusquedaMaterial] = useState("");
  const [mostrarMaterialRapido, setMostrarMaterialRapido] = useState(null);
  const [rapido, setRapido] = useState({ codigo: "", nombre: "", unidadMedida: "unidad" });
  const [errorRapido, setErrorRapido] = useState("");
  const [guardandoRapido, setGuardandoRapido] = useState(false);

  const [formulario, setFormulario] = useState({ producto_nombre: "", unidad_producto: "unidad" });
  const [lineas, setLineas] = useState([{ ...lineaVacia }]);
  const primerCampo = useRef(null);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const [datosRecetas, datosMateriales, catalogo] = await Promise.all([
        obtenerRecetas(),
        listarMateriales().catch(() => []),
        obtenerUnidades(),
      ]);
      setRecetas(Array.isArray(datosRecetas) ? datosRecetas : []);
      const mats = Array.isArray(datosMateriales) ? datosMateriales : [];
      setMateriales([...mats].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")));
      setUnidades(Array.isArray(catalogo) ? catalogo : []);
      try {
        setOrdenes(await obtenerOrdenes());
      } catch {
        setOrdenes([]);
      }
    } catch (e) {
      setError(mensajeHumano(e, "No se pudieron cargar las recetas."));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => { document.title = FORMATO_TITULO("Recetas"); }, []);

  useEffect(() => {
    if (!avisoFlotante) return;
    const t = setTimeout(() => setAvisoFlotante(""), 6000);
    return () => clearTimeout(t);
  }, [avisoFlotante]);

  useEffect(() => {
    if (mostrarFormulario && primerCampo.current) primerCampo.current.focus();
  }, [mostrarFormulario]);

  useEffect(() => {
    if (!mostrarFormulario) return;
    function tecla(e) {
      if (e.key === "Escape" && !mostrarMaterialRapido) setMostrarFormulario(false);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [mostrarFormulario, mostrarMaterialRapido]);

  const materialesOrdenados = useMemo(() => {
    const q = busquedaMaterial.trim().toLowerCase();
    if (!q) return materiales;
    return materiales.filter((m) => `${m.nombre} ${m.codigo}`.toLowerCase().includes(q));
  }, [materiales, busquedaMaterial]);

  function abrirCrear() {
    setEditando(null);
    setVersionando(null);
    setFormulario({ producto_nombre: "", unidad_producto: "unidad" });
    setLineas([{ ...lineaVacia }]);
    setErrorForm("");
    setErroresCampo({});
    setBusquedaMaterial("");
    setMostrarFormulario(true);
  }

  function abrirEditar(receta) {
    setVersionando(null);
    setEditando(receta);
    setFormulario({
      producto_nombre: receta.producto_nombre,
      unidad_producto: receta.unidad_producto ?? "unidad",
    });
    setLineas(
      (receta.materiales ?? []).map((m) => ({
        material_id: String(m.material_id),
        cantidad_requerida: String(m.cantidad_requerida),
      })),
    );
    setErrorForm("");
    setErroresCampo({});
    setBusquedaMaterial("");
    setMostrarFormulario(true);
  }

  function abrirVersion(receta) {
    setEditando(null);
    setVersionando(receta);
    setFormulario({
      producto_nombre: receta.producto_nombre,
      unidad_producto: receta.unidad_producto ?? "unidad",
    });
    setLineas(
      (receta.materiales ?? []).map((m) => ({
        material_id: String(m.material_id),
        cantidad_requerida: String(m.cantidad_requerida),
      })),
    );
    setErrorForm("");
    setErroresCampo({});
    setBusquedaMaterial("");
    setMostrarFormulario(true);
  }

  function actualizarLinea(indice, campo, valor) {
    setLineas((actual) => actual.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
    setErroresCampo((actual) => {
      const siguiente = { ...actual };
      delete siguiente[`linea-${indice}-${campo}`];
      delete siguiente[`linea-${indice}`];
      return siguiente;
    });
  }

  function validar() {
    const errores = {};
    if (!formulario.producto_nombre.trim()) errores.producto_nombre = "El nombre del producto es obligatorio.";
    if (!formulario.unidad_producto) errores.unidad_producto = "La unidad del producto es obligatoria.";
    const utiles = lineas.filter((l) => l.material_id !== "" || l.cantidad_requerida !== "");
    if (utiles.length === 0) errores.lineas = "Agrega al menos un ingrediente.";
    const vistos = new Set();
    lineas.forEach((l, i) => {
      if (l.material_id === "" && l.cantidad_requerida === "") return;
      if (!l.material_id) errores[`linea-${i}-material_id`] = "Elige un material.";
      else if (vistos.has(String(l.material_id))) errores[`linea-${i}-material_id`] = "Ese material ya está en otra línea.";
      else vistos.add(String(l.material_id));
      const cant = Number(l.cantidad_requerida);
      if (!l.cantidad_requerida || !Number.isFinite(cant) || cant <= 0) {
        errores[`linea-${i}-cantidad_requerida`] = "Ingresa una cantidad mayor a cero.";
      } else if (!/^\d+(\.\d{1,4})?$/.test(String(l.cantidad_requerida).trim())) {
        errores[`linea-${i}-cantidad_requerida`] = "Hasta 4 decimales.";
      }
    });
    return { errores, utiles };
  }

  const avisoNombreDuplicado = useMemo(() => {
    const nombre = formulario.producto_nombre.trim().toLowerCase();
    if (!nombre || !mostrarFormulario || editando) return null;
    const otra = recetas.find(
      (r) => r.activa && r.producto_nombre.trim().toLowerCase() === nombre &&
        (!versionando || r.producto_codigo !== versionando.producto_codigo),
    );
    return otra ? `Ya existe una receta activa con ese nombre (${otra.producto_codigo}).` : null;
  }, [formulario.producto_nombre, recetas, mostrarFormulario, editando, versionando]);

  async function guardar(event) {
    event.preventDefault();
    if (guardando) return;
    const { errores, utiles } = validar();
    setErroresCampo(errores);
    if (Object.keys(errores).length > 0) {
      setErrorForm("Revisa los campos marcados.");
      return;
    }
    setErrorForm("");
    setGuardando(true);
    try {
      const lista = utiles.map((l) => ({ material_id: Number(l.material_id), cantidad_requerida: Number(l.cantidad_requerida) }));
      if (versionando) {
        await crearVersionReceta(versionando.id, {
          producto_nombre: formulario.producto_nombre.trim(),
          unidad_producto: formulario.unidad_producto,
          materiales: lista,
        });
        setMensaje(`Nueva versión creada para ${versionando.producto_codigo}. El código se conserva.`);
      } else if (editando) {
        await actualizarReceta(editando.id, {
          producto_nombre: formulario.producto_nombre.trim(),
          unidad_producto: formulario.unidad_producto,
          ...(lista.length ? { materiales: lista } : {}),
        });
        setMensaje(`Receta ${editando.producto_codigo} actualizada.`);
      } else {
        const creada = await crearReceta({
          producto_nombre: formulario.producto_nombre.trim(),
          unidad_producto: formulario.unidad_producto,
          materiales: lista,
        });
        setMensaje(`Receta ${creada.producto_codigo ?? "nueva"} creada. El código se generó automáticamente.`);
      }
      setMostrarFormulario(false);
      setPagina(1);
      await cargar();
    } catch (e) {
      const crudo = e?.message ?? "";
      if (/órdenes asociadas|ordenes asociadas|nueva versión|nueva version/i.test(crudo)) {
        setAvisoFlotante("No se puede editar esta receta porque ya tiene órdenes asociadas. Crea una nueva versión con los cambios.");
      } else {
        setErrorForm(mensajeHumano(e, "No se pudo guardar la receta."));
      }
    } finally {
      setGuardando(false);
    }
  }

  function ordenesDe(receta) {
    return ordenes.filter((o) => o.producto_codigo === receta.producto_codigo).length;
  }

  async function confirmarDesactivacion() {
    if (!confirmarDesactivar) return;
    try {
      await desactivarReceta(confirmarDesactivar.id);
      setMensaje(`Receta ${confirmarDesactivar.producto_codigo} desactivada.`);
      setConfirmarDesactivar(null);
      await cargar();
    } catch (e) {
      setError(mensajeHumano(e, "No se pudo desactivar la receta."));
      setConfirmarDesactivar(null);
    }
  }

  async function guardarMaterialRapido(e) {
    e.preventDefault();
    if (guardandoRapido) return;
    setErrorRapido("");
    if (!rapido.codigo.trim() || !rapido.nombre.trim() || !rapido.unidadMedida) {
      setErrorRapido("El código, el nombre y la unidad son obligatorios.");
      return;
    }
    setGuardandoRapido(true);
    try {
      const creado = await crearMaterial({
        codigo: rapido.codigo.trim(),
        nombre: rapido.nombre.trim(),
        unidadMedida: rapido.unidadMedida,
      });
      const id = String(creado.id ?? creado.material_id ?? "");
      setMateriales((actual) => [...actual, creado].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")));
      if (mostrarMaterialRapido != null) {
        actualizarLinea(mostrarMaterialRapido, "material_id", id);
      }
      setMensaje(`Material ${creado.codigo} creado y seleccionado.`);
      setMostrarMaterialRapido(null);
      setRapido({ codigo: "", nombre: "", unidadMedida: "unidad" });
    } catch (err) {
      setErrorRapido(mensajeHumano(err, "No se pudo crear el material."));
    } finally {
      setGuardandoRapido(false);
    }
  }

  async function verVersiones(receta) {
    setError("");
    try {
      setVersiones({ receta, lista: await listarVersionesReceta(receta.id) });
    } catch (e) {
      setError(mensajeHumano(e, "No se pudieron cargar las versiones."));
    }
  }

  const visibles = recetas.filter((r) => (verInactivas ? true : r.activa));
  const paginasRecetas = totalPaginas(visibles);
  const recetasVisibles = paginar(visibles, pagina);
  const puedeGestionarMateriales = tienePermiso(usuario, "recetas.gestionar");

  return (
    <section className="ts-page" aria-labelledby="recetas-titulo">
      <PageHeader
        titulo="Recetas"
        conteo={!cargando && !error ? `${visibles.length} recetas` : null}
        accion={<button type="button" className="ts-btn ts-btn-primary" onClick={abrirCrear}>Nueva receta</button>}
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
          <div className="ts-panel-title"><h2 id="recetas-titulo">Listado</h2><span>{visibles.length} resultados</span></div>
          <div className="ts-filters" style={{ paddingTop: 0, paddingBottom: 10 }}>
            <label htmlFor="recetas-ver-inactivas" className="ts-check-discreto">
              <input id="recetas-ver-inactivas" type="checkbox" checked={verInactivas} onChange={(e) => { setVerInactivas(e.target.checked); setPagina(1); }} />
              Ver inactivas (versiones anteriores)
            </label>
          </div>
          {visibles.length === 0 ? (
            <p className="ts-empty">Sin recetas.</p>
          ) : (
            <div className="ts-table-wrap">
              <table className="ts-table">
                <caption>Recetas de productos</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Unidad</th>
                    <th scope="col">Versión</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Materiales</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {recetasVisibles.map((receta) => (
                    <tr key={receta.id}>
                      <td className="ts-code">{receta.producto_codigo}</td>
                      <td>{receta.producto_nombre}</td>
                      <td>{receta.unidad_producto ?? "unidad"}</td>
                      <td>v{receta.id}</td>
                      <td><BadgeActivo activo={receta.activa} /></td>
                      <td>
                        {(receta.materiales ?? []).length === 0 ? "—" : (
                          <>
                            <span>{(receta.materiales ?? []).length} ingredientes</span>
                            {(receta.materiales ?? []).map((m) => (
                              <div key={m.material_id}>
                                {m.nombre ?? m.codigo ?? `Material ${m.material_id}`} — {formatearCantidad(m.cantidad_requerida, m.unidad_medida)}
                              </div>
                            ))}
                          </>
                        )}
                      </td>
                      <td className="ts-actions">
                        <button type="button" className="ts-btn ts-btn--sm" onClick={() => abrirEditar(receta)}>Editar</button>
                        {receta.activa && <button type="button" className="ts-btn ts-btn--sm" onClick={() => setConfirmarDesactivar(receta)}>Desactivar</button>}
                        <button type="button" className="ts-btn ts-btn--sm" onClick={() => abrirVersion(receta)}>Nueva versión</button>
                        <button type="button" className="ts-btn ts-btn--sm ts-btn-quiet" onClick={() => verVersiones(receta)} title="Ver versiones">Versiones</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion pagina={pagina} total={paginasRecetas} alCambiar={setPagina} etiqueta="Paginación de recetas" />
        </div>
      )}

      {avisoFlotante && (
        <div className="ts-toast" role="alert">
          <p>{avisoFlotante}</p>
          <button type="button" className="ts-btn ts-btn--sm ts-btn-quiet" onClick={() => setAvisoFlotante("")} aria-label="Cerrar aviso">
            Cerrar
          </button>
        </div>
      )}

      {mostrarFormulario && (
        <div className="ts-modal-overlay">
          <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="receta-form-titulo">
            <h2 id="receta-form-titulo">{versionando ? `Nueva versión de ${versionando.producto_codigo}` : editando ? `Editar receta ${editando.producto_codigo}` : "Crear receta"}</h2>
            {(versionando || editando) && (
              <p>Código: <strong className="ts-code">{(versionando ?? editando).producto_codigo}</strong></p>
            )}
            <form onSubmit={guardar} noValidate>
              <label htmlFor="receta-nombre">Nombre del producto *
                <input
                  ref={primerCampo}
                  id="receta-nombre"
                  value={formulario.producto_nombre}
                  onChange={(e) => setFormulario({ ...formulario, producto_nombre: e.target.value })}
                  disabled={guardando}
                  placeholder="p. ej. Pan integral"
                />
              </label>
              {erroresCampo.producto_nombre && <small className="ts-field-error">{erroresCampo.producto_nombre}</small>}
              {avisoNombreDuplicado && <p className="ts-modal-error" role="note">{avisoNombreDuplicado}</p>}
              <label htmlFor="receta-unidad">Unidad del producto *
                <select
                  id="receta-unidad"
                  value={formulario.unidad_producto}
                  onChange={(e) => setFormulario({ ...formulario, unidad_producto: e.target.value })}
                  disabled={guardando}
                >
                  <option value="">Selecciona una unidad</option>
                  {unidades.map((u) => (
                    <option key={u.codigo} value={u.codigo}>{u.nombre} ({u.simbolo})</option>
                  ))}
                </select>
              </label>
              {erroresCampo.unidad_producto && <small className="ts-field-error">{erroresCampo.unidad_producto}</small>}
              <p className="ts-field-help">
                Cantidad por 1 {formulario.unidad_producto || "unidad"}.
              </p>
              <h3>Ingredientes *</h3>
              <label htmlFor="receta-buscar-material">Buscar material
                <input
                  id="receta-buscar-material"
                  type="search"
                  placeholder="Filtrar por nombre o código"
                  value={busquedaMaterial}
                  onChange={(e) => setBusquedaMaterial(e.target.value)}
                  disabled={guardando}
                />
              </label>
              {lineas.map((linea, i) => {
                const elegidos = new Set(lineas.map((l, j) => (j === i ? null : String(l.material_id))).filter(Boolean));
                const unidad = unidadDeMaterial(materiales, linea.material_id);
                return (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <label style={{ flex: 2 }} htmlFor={`receta-mat-${i}`}>Material *
                      <select
                        id={`receta-mat-${i}`}
                        value={linea.material_id}
                        onChange={(e) => actualizarLinea(i, "material_id", e.target.value)}
                        disabled={guardando}
                      >
                        <option value="">Selecciona material</option>
                        {materialesOrdenados
                          .filter((m) => !elegidos.has(String(m.id)) || String(m.id) === String(linea.material_id))
                          .map((m) => (
                            <option key={m.id} value={m.id}>{m.nombre} ({m.codigo}) — {m.unidadMedida ?? m.unidad_medida}</option>
                          ))}
                      </select>
                      {erroresCampo[`linea-${i}-material_id`] && <small className="ts-field-error">{erroresCampo[`linea-${i}-material_id`]}</small>}
                    </label>
                    <label style={{ flex: 1 }} htmlFor={`receta-cant-${i}`}>Cantidad *{unidad ? ` (${unidad})` : ""}
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input
                          id={`receta-cant-${i}`}
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          value={linea.cantidad_requerida}
                          onChange={(e) => actualizarLinea(i, "cantidad_requerida", e.target.value)}
                          disabled={guardando}
                          placeholder="0"
                        />
                        {unidad && <span aria-hidden="true">{unidad}</span>}
                      </div>
                      {erroresCampo[`linea-${i}-cantidad_requerida`] && <small className="ts-field-error">{erroresCampo[`linea-${i}-cantidad_requerida`]}</small>}
                    </label>
                    <button type="button" className="ts-btn" aria-label={`Quitar línea ${i + 1}`} disabled={guardando || lineas.length <= 1} onClick={() => setLineas((actual) => (actual.length <= 1 ? actual : actual.filter((_, j) => j !== i)))}>Quitar</button>
                  </div>
                );
              })}
              {erroresCampo.lineas && <p className="ts-modal-error" role="alert">{erroresCampo.lineas}</p>}
              <div className="ts-btn-group">
                <button type="button" className="ts-btn" disabled={guardando} onClick={() => setLineas((actual) => [...actual, { ...lineaVacia }])}>Agregar línea</button>
                {puedeGestionarMateriales && (
                  <button type="button" className="ts-btn" disabled={guardando} onClick={() => { setErrorRapido(""); setMostrarMaterialRapido(lineas.length - 1); }}>
                    Crear material
                  </button>
                )}
              </div>
              {errorForm && <p role="alert" className="ts-modal-error">{errorForm}</p>}
              <div className="ts-modal-actions">
                <button type="button" className="ts-btn" disabled={guardando} onClick={() => setMostrarFormulario(false)}>Cancelar</button>
                <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarMaterialRapido != null && (
        <div className="ts-modal-overlay">
          <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="material-rapido-titulo">
            <h2 id="material-rapido-titulo">Crear material</h2>
            <form onSubmit={guardarMaterialRapido} noValidate>
              <label htmlFor="rapido-codigo">Código *
                <input id="rapido-codigo" value={rapido.codigo} onChange={(e) => setRapido({ ...rapido, codigo: e.target.value })} disabled={guardandoRapido} placeholder="p. ej. MAT-001" />
              </label>
              <label htmlFor="rapido-nombre">Nombre *
                <input id="rapido-nombre" value={rapido.nombre} onChange={(e) => setRapido({ ...rapido, nombre: e.target.value })} disabled={guardandoRapido} placeholder="p. ej. Harina" />
              </label>
              <label htmlFor="rapido-unidad">Unidad *
                <select id="rapido-unidad" value={rapido.unidadMedida} onChange={(e) => setRapido({ ...rapido, unidadMedida: e.target.value })} disabled={guardandoRapido}>
                  {unidades.map((u) => (
                    <option key={u.codigo} value={u.codigo}>{u.nombre} ({u.simbolo})</option>
                  ))}
                </select>
              </label>
              {errorRapido && <p role="alert" className="ts-modal-error">{errorRapido}</p>}
              <div className="ts-modal-actions">
                <button type="button" className="ts-btn" disabled={guardandoRapido} onClick={() => setMostrarMaterialRapido(null)}>Cancelar</button>
                <button type="submit" className="ts-btn ts-btn-primary" disabled={guardandoRapido}>{guardandoRapido ? "Guardando…" : "Crear material"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmarDesactivar && (
        <div className="ts-modal-overlay">
          <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="desactivar-titulo">
            <h2 id="desactivar-titulo">Desactivar receta {confirmarDesactivar.producto_codigo}</h2>
            <p>La receta dejará de estar disponible para nuevas órdenes.</p>
            <p>{ordenesDe(confirmarDesactivar) > 0
              ? `Tiene ${ordenesDe(confirmarDesactivar)} orden(es) asociadas. Las órdenes existentes no se modifican.`
              : "No tiene órdenes asociadas."}</p>
            <div className="ts-modal-actions">
              <button type="button" className="ts-btn" onClick={() => setConfirmarDesactivar(null)}>Cancelar</button>
              <button type="button" className="ts-btn ts-btn-danger" onClick={confirmarDesactivacion}>Desactivar</button>
            </div>
          </div>
        </div>
      )}

      {versiones && (
        <div className="ts-modal-overlay">
          <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="receta-versiones-titulo">
            <h2 id="receta-versiones-titulo">Versiones de {versiones.receta.producto_codigo}</h2>
            <ul>
              {(versiones.lista ?? []).map((v) => {
                const { fecha, hora } = formatearFechaHora(v.actualizado_en ?? v.creado_en);
                return (
                  <li key={v.id}>
                    v{v.id} — {v.producto_nombre} — {formatearCantidad(1, v.unidad_producto)} — {v.activa ? "activa" : "inactiva"} — {(v.materiales ?? []).length} materiales — {fecha} {hora}
                    <ul>
                      {(v.materiales ?? []).map((m) => (
                        <li key={m.material_id}>{m.nombre ?? m.codigo}: {formatearCantidad(m.cantidad_requerida, m.unidad_medida)}</li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            <div className="ts-modal-actions">
              <button type="button" className="ts-btn" onClick={() => setVersiones(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
