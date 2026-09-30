import { useEffect, useState } from "react";
import { crearOrden } from "../../services/ordenesService.js";
import { obtenerRecetas } from "../../services/recetasService.js";

const formularioVacio = { producto_id: "", cantidad: "", fecha_programada: "" };

// Modal de creación (ABC-79). Validaciones idénticas a la pantalla anterior:
// receta activa obligatoria, cantidad > 0 con hasta 4 decimales,
// fecha programada obligatoria y no anterior a hoy.
export default function CrearOrdenModal({ abierto, alCerrar, alCrear }) {
  const [recetas, setRecetas] = useState([]);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [errores, setErrores] = useState({});
  const [errorGuardado, setErrorGuardado] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [guardando, setGuardando] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!abierto) return;
    setFormulario(formularioVacio);
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
  }, [abierto ]);

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
    if (!formulario.cantidad || !Number.isFinite(cantidad) || cantidad <= 0 || !/^\d+(?:\.\d{1,4})?$/.test(formulario.cantidad)) {
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
        <h2 id="titulo-nueva-orden">Crear nueva orden</h2>
        <p>Selecciona una receta activa e ingresa los datos de programación.</p>
        {errorCarga ? (
          <p className="ts-modal-error" role="alert">{errorCarga}</p>
        ) : (
          <form onSubmit={registrar} noValidate>
            <label htmlFor="nueva-orden-producto">Producto *
              <select id="nueva-orden-producto" name="producto_id" value={formulario.producto_id} onChange={manejarCambio} disabled={guardando}>
                <option value="">Selecciona una receta activa</option>
                {recetas.map((receta) => (
                  <option key={receta.id} value={receta.id}>
                    {receta.producto_nombre} ({receta.producto_codigo})
                  </option>
                ))}
              </select>
              {errores.producto_id && <small className="ts-field-error">{errores.producto_id}</small>}
            </label>
            <label htmlFor="nueva-orden-cantidad">Cantidad *
              <input id="nueva-orden-cantidad" type="number" name="cantidad" min="0.0001" step="0.0001" value={formulario.cantidad} onChange={manejarCambio} disabled={guardando} />
              {errores.cantidad && <small className="ts-field-error">{errores.cantidad}</small>}
            </label>
            <label htmlFor="nueva-orden-fecha">Fecha programada *
              <input id="nueva-orden-fecha" type="date" name="fecha_programada" min={hoy} value={formulario.fecha_programada} onChange={manejarCambio} disabled={guardando} />
              {errores.fecha_programada && <small className="ts-field-error">{errores.fecha_programada}</small>}
            </label>
            <p>El responsable será tu usuario autenticado.</p>
            {recetas.length === 0 && <p className="ts-modal-error">No hay recetas activas. Registra una receta para poder crear órdenes.</p>}
            {errorGuardado && <p role="alert" className="ts-modal-error">{errorGuardado}</p>}
            <div className="ts-modal-actions">
              <button type="button" className="ts-btn" disabled={guardando} onClick={alCerrar}>Cancelar</button>
              <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando || recetas.length === 0}>
                {guardando ? "Guardando…" : "Registrar orden"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
