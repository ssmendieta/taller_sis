import React, { useState } from "react";
import "../styles/OrdenPage.css";

function OrdenPage() {
  const [ordenes, setOrdenes] = useState([
    {
      id: 1,
      numero: "ORD-001",
      producto: "Producto A",
      cantidad: 50,
      fecha: "27/09/2026",
      prioridad: "Normal",
      estado: "Registrada",
    },
    {
      id: 2,
      numero: "ORD-002",
      producto: "Producto B",
      cantidad: 30,
      fecha: "27/09/2026",
      prioridad: "Alta",
      estado: "Registrada",
    },
  ]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const [formulario, setFormulario] = useState({
    producto: "",
    cantidad: "",
    fecha: "",
    prioridad: "Normal",
    observaciones: "",
  });

  const [errores, setErrores] = useState({});

  const abrirFormulario = () => {
    setFormulario({
      producto: "",
      cantidad: "",
      fecha: "",
      prioridad: "Normal",
      observaciones: "",
    });

    setErrores({});
    setMostrarFormulario(true);
  };

  const cerrarFormulario = () => {
    setMostrarFormulario(false);
    setErrores({});
  };

  const manejarCambio = (e) => {
    const { name, value } = e.target;

    setFormulario((anterior) => ({
      ...anterior,
      [name]: value,
    }));

    setErrores((anterior) => ({
      ...anterior,
      [name]: "",
    }));
  };

  const registrarOrden = (e) => {
    e.preventDefault();

    const nuevosErrores = {};

    if (!formulario.producto.trim()) {
      nuevosErrores.producto = "El producto es obligatorio.";
    }

    if (!formulario.cantidad) {
      nuevosErrores.cantidad = "La cantidad es obligatoria.";
    } else if (Number(formulario.cantidad) <= 0) {
      nuevosErrores.cantidad = "La cantidad debe ser mayor a 0.";
    }

    if (!formulario.fecha) {
      nuevosErrores.fecha = "La fecha es obligatoria.";
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }

    const nuevaOrden = {
      id: Date.now(),
      numero: `ORD-${String(ordenes.length + 1).padStart(3, "0")}`,
      producto: formulario.producto,
      cantidad: Number(formulario.cantidad),
      fecha: formulario.fecha.split("-").reverse().join("/"),
      prioridad: formulario.prioridad,
      estado: "Registrada",
    };

    setOrdenes((anteriores) => [...anteriores, nuevaOrden]);

    setMostrarFormulario(false);

    setMensaje("Orden registrada correctamente.");

    setTimeout(() => {
      setMensaje("");
    }, 3000);
  };

  return (
    <div className="ordenes-container">

      <div className="ordenes-header">
        <div>
          <h1>Órdenes</h1>
          <p>
            Registra y consulta las órdenes de producción del sistema.
          </p>
        </div>

        <button
          type="button"
          className="btn-nueva-orden"
          onClick={abrirFormulario}
        >
          + Nueva orden
        </button>
      </div>

      <div className="ordenes-tabla-container">
        <table className="ordenes-tabla">
          <thead>
            <tr>
              <th>N.º Orden</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Fecha</th>
              <th>Prioridad</th>
              <th>Estado</th>
            </tr>
          </thead>

          <tbody>
            {ordenes.map((orden) => (
              <tr key={orden.id}>
                <td>
                  <strong>{orden.numero}</strong>
                </td>

                <td>{orden.producto}</td>

                <td>{orden.cantidad}</td>

                <td>{orden.fecha}</td>

                <td>
                  <span
                    className={`prioridad ${orden.prioridad.toLowerCase()}`}
                  >
                    {orden.prioridad}
                  </span>
                </td>

                <td>
                  <span className="estado-orden">
                    ● {orden.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mostrarFormulario && (
        <div className="orden-modal-overlay">
          <div className="orden-modal">

            <div className="orden-modal-header">
              <div>
                <h2>Crear nueva orden</h2>
                <p>
                  Ingresa la información necesaria para registrar la orden.
                </p>
              </div>

              <button
                type="button"
                className="orden-btn-cerrar"
                onClick={cerrarFormulario}
              >
                ×
              </button>
            </div>

            <form onSubmit={registrarOrden}>

              <div className="orden-form-group">
                <label>
                  Producto <span>*</span>
                </label>

                <input
                  type="text"
                  name="producto"
                  placeholder="Ej. Producto A"
                  value={formulario.producto}
                  onChange={manejarCambio}
                />

                {errores.producto && (
                  <small className="mensaje-error">
                    {errores.producto}
                  </small>
                )}
              </div>

              <div className="orden-form-group">
                <label>
                  Cantidad <span>*</span>
                </label>

                <input
                  type="number"
                  name="cantidad"
                  min="1"
                  placeholder="Ej. 50"
                  value={formulario.cantidad}
                  onChange={manejarCambio}
                />

                {errores.cantidad && (
                  <small className="mensaje-error">
                    {errores.cantidad}
                  </small>
                )}
              </div>

              <div className="orden-form-group">
                <label>
                  Fecha de orden <span>*</span>
                </label>

                <input
                  type="date"
                  name="fecha"
                  value={formulario.fecha}
                  onChange={manejarCambio}
                />

                {errores.fecha && (
                  <small className="mensaje-error">
                    {errores.fecha}
                  </small>
                )}
              </div>

              <div className="orden-form-group">
                <label>Prioridad</label>

                <select
                  name="prioridad"
                  value={formulario.prioridad}
                  onChange={manejarCambio}
                >
                  <option value="Normal">Normal</option>
                  <option value="Alta">Alta</option>
                  <option value="Urgente">Urgente</option>
                </select>
              </div>

              <div className="orden-form-group">
                <label>Observaciones</label>

                <textarea
                  name="observaciones"
                  placeholder="Observaciones adicionales..."
                  value={formulario.observaciones}
                  onChange={manejarCambio}
                  rows="3"
                />
              </div>

              <div className="orden-modal-footer">
                <button
                  type="button"
                  className="orden-btn-cancelar"
                  onClick={cerrarFormulario}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="orden-btn-guardar"
                >
                  Registrar orden
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {mensaje && (
        <div className="orden-mensaje-exito">
          <span>✓</span>
          {mensaje}
        </div>
      )}

    </div>
  );
}

export default OrdenPage;