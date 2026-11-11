import { ESTADOS_ORDEN_HISTORIAL } from "../../../services/historialProduccionService.js";
import { formatearEstadoOrden } from "../../../utils/format.js";

export default function FiltrosHistorialProduccion({
  filtros,
  alCambiar,
  alAplicar,
  alLimpiar,
  error,
  deshabilitado = false,
}) {
  const cambiar = (campo) => (evento) => {
    alCambiar({ ...filtros, [campo]: evento.target.value });
  };

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        alAplicar();
      }}
      aria-label="Filtros del historial de órdenes"
      noValidate
    >
      <div className="ts-filters">
        <label htmlFor="historial-desde">
          Desde
          <input
            id="historial-desde"
            type="date"
            value={filtros.fechaDesde || ""}
            onChange={cambiar("fechaDesde")}
            min="0001-01-01"
            max="9999-12-31"
            disabled={deshabilitado}
          />
        </label>

        <label htmlFor="historial-hasta">
          Hasta
          <input
            id="historial-hasta"
            type="date"
            value={filtros.fechaHasta || ""}
            onChange={cambiar("fechaHasta")}
            min="0001-01-01"
            max="9999-12-31"
            disabled={deshabilitado}
          />
        </label>

        <label htmlFor="historial-estado">
          Estado
          <select
            id="historial-estado"
            value={filtros.estado || ""}
            onChange={cambiar("estado")}
            disabled={deshabilitado}
          >
            <option value="">Todos los estados</option>
            {ESTADOS_ORDEN_HISTORIAL.map((est) => (
              <option key={est} value={est}>
                {formatearEstadoOrden(est)}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="historial-producto">
          Producto
          <input
            id="historial-producto"
            type="text"
            value={filtros.producto || ""}
            onChange={cambiar("producto")}
            maxLength={150}
            placeholder="Código o nombre de producto"
            disabled={deshabilitado}
          />
        </label>

        <div className="ts-btn-group">
          <button
            type="submit"
            className="ts-btn ts-btn-primary"
            disabled={deshabilitado}
          >
            Filtrar
          </button>
          <button
            type="button"
            className="ts-btn"
            onClick={alLimpiar}
            disabled={deshabilitado}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {error && (
        <p
          className="ts-modal-error"
          role="alert"
          style={{ padding: "0 20px 12px" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
