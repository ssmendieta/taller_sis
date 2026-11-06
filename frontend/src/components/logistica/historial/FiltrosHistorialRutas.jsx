import { useState } from "react";
import { ESTADOS_RUTA } from "../../../services/historialLogisticoService.js";

export const FILTROS_HISTORIAL_INICIALES = { fechaDesde: "", fechaHasta: "", estado: "", chofer: "", limit: 10 };

export default function FiltrosHistorialRutas({ iniciales = FILTROS_HISTORIAL_INICIALES, alAplicar, deshabilitado }) {
  const [filtros, setFiltros] = useState(iniciales);
  const [error, setError] = useState("");
  const cambiar = (campo) => (evento) =>
    setFiltros((actuales) => ({ ...actuales, [campo]: campo === "limit" ? Number(evento.target.value) : evento.target.value }));

  function aplicar(evento) {
    evento.preventDefault();
    if (filtros.fechaDesde && filtros.fechaHasta && filtros.fechaDesde > filtros.fechaHasta) {
      setError("La fecha desde no puede ser posterior a la fecha hasta.");
      return;
    }
    setError("");
    alAplicar({ ...filtros, chofer: filtros.chofer.trim() });
  }

  function limpiar() {
    setFiltros(FILTROS_HISTORIAL_INICIALES);
    setError("");
    alAplicar(FILTROS_HISTORIAL_INICIALES);
  }

  return (
    <form onSubmit={aplicar} aria-label="Filtros del historial de rutas" style={{ padding: "12px 20px" }}>
      <div className="ts-filters">
        <label htmlFor="historial-desde">Desde
          <input id="historial-desde" type="date" value={filtros.fechaDesde} onChange={cambiar("fechaDesde")} />
        </label>
        <label htmlFor="historial-hasta">Hasta
          <input id="historial-hasta" type="date" value={filtros.fechaHasta} onChange={cambiar("fechaHasta")} />
        </label>
        <label htmlFor="historial-estado">Estado
          <select id="historial-estado" value={filtros.estado} onChange={cambiar("estado")}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_RUTA).map(([valor, { texto }]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </label>
        <label htmlFor="historial-chofer">Chofer
          <input id="historial-chofer" type="text" maxLength={80} placeholder="Ej. CHO-07"
            value={filtros.chofer} onChange={cambiar("chofer")} />
        </label>
        <label htmlFor="historial-limite">Registros por página
          <select id="historial-limite" value={filtros.limit} onChange={cambiar("limit")}>
            {[5, 10, 20].map((cantidad) => <option key={cantidad} value={cantidad}>{cantidad}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="ts-modal-error" role="alert">{error}</p>}
      <div className="ts-btn-group" style={{ marginTop: 12 }}>
        <button type="submit" className="ts-btn ts-btn-primary" disabled={deshabilitado}>Aplicar filtros</button>
        <button type="button" className="ts-btn" onClick={limpiar} disabled={deshabilitado}>Limpiar filtros</button>
      </div>
    </form>
  );
}
