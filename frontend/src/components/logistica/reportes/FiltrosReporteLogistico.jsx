import { ESTADOS_RUTA } from "../../../services/historialLogisticoService.js";
import { ESTADOS_BOLETA_REPORTE } from "../../../services/reportesLogisticosService.js";

export default function FiltrosReporteLogistico({ filtros, alCambiar, alConsultar, alLimpiar, error }) {
  const cambiar = (campo) => (evento) => alCambiar({ ...filtros, [campo]: evento.target.value });
  return (
    <form aria-label="Filtros del reporte logístico" noValidate onSubmit={(evento) => { evento.preventDefault(); alConsultar(); }}>
      <div className="ts-filters">
        <label htmlFor="reporte-logistico-desde">Desde
          <input id="reporte-logistico-desde" type="date" required value={filtros.fechaDesde} onChange={cambiar("fechaDesde")} />
        </label>
        <label htmlFor="reporte-logistico-hasta">Hasta
          <input id="reporte-logistico-hasta" type="date" required value={filtros.fechaHasta} onChange={cambiar("fechaHasta")} />
        </label>
        <label htmlFor="reporte-logistico-ruta">Estado de ruta
          <select id="reporte-logistico-ruta" value={filtros.estadoRuta} onChange={cambiar("estadoRuta")}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_RUTA).map(([valor, { texto }]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </label>
        <label htmlFor="reporte-logistico-boleta">Estado de boleta
          <select id="reporte-logistico-boleta" value={filtros.estadoBoleta} onChange={cambiar("estadoBoleta")}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_BOLETA_REPORTE).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </label>
        <div className="ts-btn-group">
          <button className="ts-btn ts-btn-primary" type="submit">Consultar reporte</button>
          <button className="ts-btn" type="button" onClick={alLimpiar}>Limpiar filtros</button>
        </div>
      </div>
      {error && <p className="ts-modal-error reporte-logistico-nota" role="alert">{error}</p>}
    </form>
  );
}
