import { formatearFecha } from "../../../utils/format.js";

// ABC-372: datos generales de la ruta (grupo y fecha). Las paradas y los recursos
// son paneles hermanos dentro del mismo <form> que arma RutasPage.
export default function FormularioRuta({ valores, grupos, editandoId, enviando, error, exito, onCambiar, onSubmit, onCancelar, children }) {
  return (
    <form onSubmit={onSubmit} aria-label="Planificar ruta" noValidate className="rutas-formulario">
      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="rutas-titulo">{editandoId ? `Editar ruta #${editandoId}` : "Nueva ruta"}</h2>
        </div>
        <div className="ts-filters">
          <label htmlFor="ruta-grupo">Grupo de salida
            <select id="ruta-grupo" value={valores.grupoId} onChange={(evento) => onCambiar("grupoId", evento.target.value)}>
              <option value="">Sin grupo</option>
              {grupos.map((grupo) => (
                <option key={grupo.id} value={grupo.id} disabled={grupo.despachado}>
                  #{grupo.id} · {grupo.destino} · {formatearFecha(grupo.fechaRequerida)}{grupo.despachado ? " (despachado)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="ruta-fecha">Fecha programada
            <input id="ruta-fecha" type="date" required value={valores.fecha}
              onChange={(evento) => onCambiar("fecha", evento.target.value)} />
          </label>
        </div>
        <p className="ts-field-help rutas-nota">
          Al elegir un grupo se precargan su fecha y destino. Elegir recursos no los reserva: el ERP confirma la
          asignación al guardar.
        </p>
      </div>

      {children}

      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error.mensaje}</p>
          {error.conflictos?.length > 0 && (
            <ul>
              {error.conflictos.map((conflicto, indice) => (
                <li key={`${conflicto.recurso}-${conflicto.idExterno}-${indice}`}>
                  {conflicto.recurso === "CHOFER" ? "Chofer" : "Vehículo"} {conflicto.idExterno}: {conflicto.motivo}
                </li>
              ))}
            </ul>
          )}
          <p className="ts-field-help">Tus datos siguen en el formulario: corrige lo indicado y vuelve a guardar.</p>
        </div>
      )}
      {exito && <p className="ts-success" role="status">{exito}</p>}

      <div className="ts-btn-group rutas-acciones">
        <button type="submit" className="ts-btn ts-btn-primary" disabled={enviando}>
          {enviando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar ruta"}
        </button>
        {editandoId && <button type="button" className="ts-btn" onClick={onCancelar} disabled={enviando}>Cancelar edición</button>}
      </div>
    </form>
  );
}
