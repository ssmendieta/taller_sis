import { useEffect, useState } from "react";
import { crearOrdenProduccion, obtenerOrdenesProduccion } from "../services/api.js";
import { obtenerRecetas } from "../services/recetasService.js";
import "../styles/OrdenPage.css";

const formularioVacio = {
  producto_id: "",
  cantidad: "",
  fecha_programada: "",
  responsable_id: "",
};

export default function OrdenPage() {
  const [ordenes, setOrdenes] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [errores, setErrores] = useState({});
  const [errorGuardado, setErrorGuardado] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true);
    setErrorCarga("");
    Promise.all([obtenerOrdenesProduccion(controller.signal), obtenerRecetas()])
      .then(([ordenesRecibidas, recetasRecibidas]) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(recetasRecibidas)) {
          throw new Error("El servicio de recetas no devolvió una lista válida.");
        }
        setOrdenes(ordenesRecibidas);
        setRecetas(recetasRecibidas.filter((receta) => receta.activa));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setErrorCarga(error.message || "No se pudieron cargar las órdenes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [intento]);

  const abrirFormulario = () => {
    setFormulario(formularioVacio);
    setErrores({});
    setErrorGuardado("");
    setMensaje("");
    setMostrarFormulario(true);
  };

  const manejarCambio = (event) => {
    const { name, value } = event.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
    setErrores((actual) => ({ ...actual, [name]: "" }));
    setErrorGuardado("");
  };

  const registrarOrden = async (event) => {
    event.preventDefault();
    if (guardando) return;

    const nuevosErrores = {};
    const recetaId = Number(formulario.producto_id);
    const responsableId = Number(formulario.responsable_id);
    const cantidad = Number(formulario.cantidad);

    if (!Number.isSafeInteger(recetaId) || recetaId <= 0 || !recetas.some((receta) => Number(receta.id) === recetaId)) {
      nuevosErrores.producto_id = "Selecciona una receta activa.";
    }
    if (!formulario.cantidad || !Number.isFinite(cantidad) || cantidad <= 0 || !/^\d+(?:\.\d{1,4})?$/.test(formulario.cantidad)) {
      nuevosErrores.cantidad = "Ingresa una cantidad mayor a cero, con hasta 4 decimales.";
    }
    if (!formulario.fecha_programada) {
      nuevosErrores.fecha_programada = "La fecha programada es obligatoria.";
    }
    if (!/^\d+$/.test(formulario.responsable_id) || !Number.isSafeInteger(responsableId) || responsableId <= 0) {
      nuevosErrores.responsable_id = "Ingresa un ID de usuario válido.";
    }
    if (Object.keys(nuevosErrores).length) {
      setErrores(nuevosErrores);
      return;
    }

    setGuardando(true);
    setErrorGuardado("");
    try {
      const creada = await crearOrdenProduccion({
        producto_id: recetaId,
        cantidad,
        fecha_programada: formulario.fecha_programada,
        responsable_id: responsableId,
      });
      setMostrarFormulario(false);
      setMensaje(`Orden ${creada.codigo ?? creada.id} registrada correctamente.`);
      try {
        setOrdenes(await obtenerOrdenesProduccion());
      } catch {
        setErrorCarga("La orden se guardó, pero no se pudo actualizar el listado. Usa «Reintentar» para consultarlo.");
      }
    } catch (error) {
      setErrorGuardado(error.message || "No se pudo registrar la orden.");
    } finally {
      setGuardando(false);
    }
  };

  const productoDe = (orden) => orden.producto_nombre ?? recetas.find((receta) => Number(receta.id) === Number(orden.producto_id))?.producto_nombre ?? "—";

  return (
    <div className="ordenes-container">
      <div className="ordenes-header">
        <div>
          <h1>Órdenes</h1>
          <p>Registra y consulta las órdenes de producción del sistema.</p>
        </div>
        <button type="button" className="btn-nueva-orden" onClick={abrirFormulario} disabled={cargando || Boolean(errorCarga) || recetas.length === 0}>
          + Nueva orden
        </button>
      </div>

      {cargando && <p role="status">Cargando órdenes y recetas…</p>}
      {errorCarga && (
        <div role="alert" className="orden-error-carga">
          <p>{errorCarga}</p>
          <button type="button" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button>
        </div>
      )}
      {!cargando && !errorCarga && recetas.length === 0 && <p>No hay recetas activas. Registra una receta para poder crear órdenes.</p>}
      {!cargando && !errorCarga && ordenes.length === 0 && <p>Todavía no hay órdenes registradas.</p>}
      {!cargando && !errorCarga && ordenes.length > 0 && (
        <div className="ordenes-tabla-container">
          <table className="ordenes-tabla">
            <thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Fecha programada</th><th>Estado</th></tr></thead>
            <tbody>
              {ordenes.map((orden) => (
                <tr key={orden.id}>
                  <td><strong>{orden.codigo}</strong></td>
                  <td>{productoDe(orden)}</td>
                  <td>{orden.cantidad_solicitada ?? orden.cantidad}</td>
                  <td>{String(orden.fecha_programada ?? "").slice(0, 10)}</td>
                  <td><span className="estado-orden">{orden.estado?.replaceAll("_", " ")}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarFormulario && (
        <div className="orden-modal-overlay">
          <div className="orden-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-nueva-orden">
            <div className="orden-modal-header">
              <div><h2 id="titulo-nueva-orden">Crear nueva orden</h2><p>Selecciona una receta activa e ingresa los datos de programación.</p></div>
              <button type="button" className="orden-btn-cerrar" aria-label="Cerrar" disabled={guardando} onClick={() => setMostrarFormulario(false)}>×</button>
            </div>
            <form onSubmit={registrarOrden}>
              <div className="orden-form-group">
                <label htmlFor="producto_id">Producto <span>*</span></label>
                <select id="producto_id" name="producto_id" value={formulario.producto_id} onChange={manejarCambio}>
                  <option value="">Selecciona una receta activa</option>
                  {recetas.map((receta) => <option key={receta.id} value={receta.id}>{receta.producto_nombre} ({receta.producto_codigo})</option>)}
                </select>
                {errores.producto_id && <small className="mensaje-error">{errores.producto_id}</small>}
              </div>
              <div className="orden-form-group">
                <label htmlFor="cantidad">Cantidad <span>*</span></label>
                <input id="cantidad" type="number" name="cantidad" min="0.0001" step="0.0001" value={formulario.cantidad} onChange={manejarCambio} />
                {errores.cantidad && <small className="mensaje-error">{errores.cantidad}</small>}
              </div>
              <div className="orden-form-group">
                <label htmlFor="fecha_programada">Fecha programada <span>*</span></label>
                <input id="fecha_programada" type="date" name="fecha_programada" value={formulario.fecha_programada} onChange={manejarCambio} />
                {errores.fecha_programada && <small className="mensaje-error">{errores.fecha_programada}</small>}
              </div>
              <div className="orden-form-group">
                <label htmlFor="responsable_id">ID del responsable <span>*</span></label>
                <input id="responsable_id" type="number" name="responsable_id" min="1" step="1" placeholder="ID de un usuario existente" value={formulario.responsable_id} onChange={manejarCambio} />
                {errores.responsable_id && <small className="mensaje-error">{errores.responsable_id}</small>}
              </div>
              {errorGuardado && <p role="alert" className="mensaje-error">{errorGuardado}</p>}
              <div className="orden-modal-footer">
                <button type="button" className="orden-btn-cancelar" disabled={guardando} onClick={() => setMostrarFormulario(false)}>Cancelar</button>
                <button type="submit" className="orden-btn-guardar" disabled={guardando}>{guardando ? "Guardando…" : "Registrar orden"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {mensaje && <div className="orden-mensaje-exito" role="status"><span>✓</span>{mensaje}</div>}
    </div>
  );
}
