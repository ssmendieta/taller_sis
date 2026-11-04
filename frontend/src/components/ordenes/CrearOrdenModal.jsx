import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { crearOrden } from "../../services/ordenesService.js";
import { obtenerRecetas } from "../../services/recetasService.js";
import { tienePermiso } from "../../services/permisos.js";
import { useSesion } from "../../context/SesionContext.jsx";
import { formatearCantidad } from "../../utils/format.js";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Modal de creación: muestra la unidad de la receta como sufijo, vista
// previa de materiales requeridos (cálculo en cliente solo como vista
// previa; el backend es la fuente de verdad al crear la orden).
export default function CrearOrdenModal({ abierto, alCerrar, alCrear }) {
  const { usuario } = useSesion();
  const [recetas, setRecetas] = useState([]);
  const [formulario, setFormulario] = useState({ producto_id: "", cantidad: "", fecha_programada: hoyISO() });
  const [errores, setErrores] = useState({});
  const [errorGuardado, setErrorGuardado] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyISO();
  const puedeIrARecetas = tienePermiso(usuario, "recetas.gestionar");

  useEffect(() => {
    if (!abierto) return;
    setFormulario({ producto_id: "", cantidad: "", fecha_programada: hoyISO() });
    setErrores({});
    setErrorGuardado("");
    setErrorCarga("");
    let cancelado = false;
    obtenerRecetas()
      .then((datos) => {
        if (cancelado) return;
        if (!Array.isArray(datos)) throw new Error("El servicio de recetas no devolvió una lista válida.");
        setRecetas(datos.filter((receta) => receta.activa));
      })
      .catch((fallo) => {
        if (!cancelado) setErrorCarga(fallo.message || "No se pudieron cargar las recetas.");
      });
    return () => { cancelado = true; };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function tecla(e) {
      if (e.key === "Escape" && !guardando) alCerrar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, guardando, alCerrar]);

  const recetaElegida = recetas.find((r) => String(r.id) === String(formulario.producto_id));
  const unidad = recetaElegida?.unidad_producto ?? "";

  const vistaPrevia = useMemo(() => {
    const cant = Number(formulario.cantidad);
    if (!recetaElegida || !Number.isFinite(cant) || cant <= 0) return [];
    return (recetaElegida.materiales ?? []).map((m) => ({
      nombre: m.nombre ?? m.codigo ?? `Material ${m.material_id}`,
      codigo: m.codigo ?? "",
      unidad: m.unidad_medida ?? "",
      requerida: Number(m.cantidad_requerida) * cant,
    }));
  }, [recetaElegida, formulario.cantidad]);

  if (!abierto) return null;

  function manejarCambio(evento) {
    const { name, value } = evento.target;
    setFormulario((actual) => ({ ...actual, [name]: value }));
    setErrores((actual) => ({ ...actual, [name]: "" }));
    setErrorGuardado("");
  }

  async function registrar(evento) {
    evento.preventDefault();
    if (guardando) return;
    const nuevosErrores = {};
    const recetaId = Number(formulario.producto_id);
    const cantidad = Number(formulario.cantidad);
    if (!Number.isSafeInteger(recetaId) || recetaId <= 0 || !recetas.some((receta) => Number(receta.id) === recetaId)) {
      nuevosErrores.producto_id = "Selecciona una receta activa.";
    }
    if (!formulario.cantidad || !Number.isFinite(cantidad) || cantidad <= 0 || !/^\d+(?:\.\d{1,4})?$/.test(String(formulario.cantidad).trim())) {
      nuevosErrores.cantidad = "Ingresa una cantidad mayor a cero, con hasta 4 decimales.";
    }
    if (!formulario.fecha_programada) {
      nuevosErrores.fecha_programada = "La fecha programada es obligatoria.";
    } else if (formulario.fecha_programada < hoy) {
      nuevosErrores.fecha_programada = "La fecha programada no puede ser anterior a hoy.";
    }
    if (Object.keys(nuevosErrores).length) {
      setErrores(nuevosErrores);
      return;
    }
    setGuardando(true);
    setErrorGuardado("");
    try {
      const creada = await crearOrden({
        producto_id: recetaId,
        cantidad,
        fecha_programada: formulario.fecha_programada,
      });
      alCrear?.(creada);
      alCerrar();
    } catch (fallo) {
      setErrorGuardado(fallo.message || "No se pudo registrar la orden.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="ts-modal-overlay">
      <div className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-nueva-orden">
        <h2 id="titulo-nueva-orden">Crear orden</h2>
        {errorCarga ? (
          <p className="ts-modal-error" role="alert">{errorCarga}</p>
        ) : recetas.length === 0 ? (
          <div role="status">
            <p className="ts-empty">Sin recetas activas. Crea una receta antes de registrar órdenes.</p>
            {puedeIrARecetas && <Link className="ts-btn ts-btn-primary" to="/recetas" onClick={alCerrar}>Ir a Recetas</Link>}
          </div>
        ) : (
          <form onSubmit={registrar} noValidate>
            <label htmlFor="nueva-orden-producto">Producto *
              <select id="nueva-orden-producto" name="producto_id" value={formulario.producto_id} onChange={manejarCambio} disabled={guardando} autoFocus>
                <option value="">Selecciona una receta activa</option>
                {recetas.map((receta) => (
                  <option key={receta.id} value={receta.id}>
                    {receta.producto_nombre} ({receta.producto_codigo}) — {receta.unidad_producto ?? "unidad"}
                  </option>
                ))}
              </select>
              {errores.producto_id && <small className="ts-field-error">{errores.producto_id}</small>}
            </label>
            <label htmlFor="nueva-orden-cantidad">Cantidad *{unidad ? ` (en ${unidad})` : ""}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input id="nueva-orden-cantidad" type="number" name="cantidad" min="0.0001" step="0.0001" value={formulario.cantidad} onChange={manejarCambio} disabled={guardando} placeholder="0" />
                {unidad && <span aria-hidden="true">{unidad}</span>}
              </div>
              {errores.cantidad && <small className="ts-field-error">{errores.cantidad}</small>}
            </label>
            {vistaPrevia.length > 0 && (
              <div className="ts-panel" style={{ margin: "8px 0" }}>
                <div className="ts-panel-title"><h3>Materiales requeridos</h3></div>
                <ul>
                  {vistaPrevia.map((m, i) => (
                    <li key={i}>{m.nombre}{m.codigo ? ` (${m.codigo})` : ""} — {formatearCantidad(m.requerida, m.unidad)}</li>
                  ))}
                </ul>
                <p className="ts-field-help">Cálculo estimado. El servidor confirma al crear la orden.</p>
              </div>
            )}
            <label htmlFor="nueva-orden-fecha">Fecha programada *
              <input id="nueva-orden-fecha" type="date" name="fecha_programada" min={hoy} value={formulario.fecha_programada} onChange={manejarCambio} disabled={guardando} />
              {errores.fecha_programada && <small className="ts-field-error">{errores.fecha_programada}</small>}
            </label>
            <p className="ts-field-help">Hoy ({hoy.split("-").reverse().join("/")}). Sin fechas pasadas.</p>
            {errorGuardado && <p role="alert" className="ts-modal-error">{errorGuardado}</p>}
            <div className="ts-modal-actions">
              <button type="button" className="ts-btn" disabled={guardando} onClick={alCerrar}>Cancelar</button>
              <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando}>
                {guardando ? "Guardando…" : "Crear orden"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
