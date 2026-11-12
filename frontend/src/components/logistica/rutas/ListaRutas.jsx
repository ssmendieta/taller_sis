import { Link } from "react-router-dom";
import { BadgeEstadoRuta } from "../historial/TablaHistorialRutas.jsx";
import { formatearFecha } from "../../../utils/format.js";

// ABC-372: rutas guardadas. Solo las PLANIFICADAS se pueden editar antes del despacho.
export default function ListaRutas({ rutas, cargando, error, editandoId, onEditar }) {
  return (
    <div className="ts-panel">
      <div className="ts-panel-title">
        <h2>Rutas</h2>
        <span>{rutas.length}</span>
      </div>
      {cargando && <p className="ts-notice" role="status">Cargando rutas…</p>}
      {error && <div className="ts-feedback ts-error" role="alert">{error}</div>}
      {!cargando && !error && rutas.length === 0 && <p className="ts-empty">Todavía no hay rutas planificadas.</p>}
      {rutas.length > 0 && (
        <div className="ts-table-wrap">
          <table className="ts-table">
            <thead>
              <tr>
                <th scope="col">Ruta</th>
                <th scope="col">Fecha</th>
                <th scope="col">Estado</th>
                <th scope="col">Vehículo</th>
                <th scope="col">Chofer</th>
                <th scope="col">Paradas</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rutas.map((ruta) => (
                <tr key={ruta.id}>
                  <td>#{ruta.id}</td>
                  <td>{formatearFecha(ruta.fechaProgramada)}</td>
                  <td><BadgeEstadoRuta estado={ruta.estado} /></td>
                  <td>{ruta.vehiculoExternoId}</td>
                  <td>{ruta.choferExternoId}</td>
                  <td>{ruta.paradas.length}</td>
                  <td>
                    <div className="ts-btn-group">
                      {ruta.estado === "PLANIFICADA" && (
                        <button type="button" className="ts-btn ts-btn--sm" disabled={editandoId === ruta.id}
                          aria-label={`Editar ruta ${ruta.id}`} onClick={() => onEditar(ruta)}>
                          {editandoId === ruta.id ? "Editando" : "Editar"}
                        </button>
                      )}
                      <Link className="ts-btn ts-btn--sm" to={`/logistica/rutas/${ruta.id}`}>Ver ruta</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
