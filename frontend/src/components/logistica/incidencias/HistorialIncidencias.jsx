import { TIPOS_INCIDENCIA } from "../../../services/logisticaService.js";
import { formatearFecha } from "../../../utils/format.js";
import { fechaHora } from "../despacho/EstadoEntregaParada.jsx";

// ABC-382: historial de la ruta. Muestra la fecha original frente a la actual,
// cada cambio de fecha y las incidencias, de la más antigua a la más reciente.
export default function HistorialIncidencias({ historial, paradas }) {
  const { incidencias, reprogramaciones } = historial;
  const tipoDe = new Map(incidencias.map((incidencia) => [String(incidencia.id), incidencia.tipo]));
  const entrega = (paradaId) => {
    if (!paradaId) return "Toda la ruta";
    const parada = paradas.find((fila) => String(fila.id) === String(paradaId));
    return parada ? `Parada ${parada.secuencia} · ${parada.destino}` : `Parada #${paradaId}`;
  };
  const tipo = (valor) => TIPOS_INCIDENCIA[valor] ?? valor ?? "—";

  return (
    <div className="incidencias-historial">
      <dl className="incidencias-fechas">
        <dt>Fecha original</dt>
        <dd>{formatearFecha(historial.fechaOriginal ?? historial.fechaProgramada)}</dd>
        <dt>Fecha programada actual</dt>
        <dd>
          {formatearFecha(historial.fechaProgramada)}
          {reprogramaciones.length === 0
            ? " · sin reprogramar"
            : ` · ${reprogramaciones.length} ${reprogramaciones.length === 1 ? "reprogramación" : "reprogramaciones"}`}
        </dd>
      </dl>

      <h3>Reprogramaciones</h3>
      {reprogramaciones.length === 0 ? (
        <p className="ts-empty">La ruta no se ha reprogramado.</p>
      ) : (
        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Cambios de fecha de la ruta</caption>
            <thead>
              <tr>
                <th scope="col">Registrada</th>
                <th scope="col">Fecha anterior → nueva</th>
                <th scope="col">Motivo</th>
                <th scope="col">Incidencia</th>
                <th scope="col">Autor</th>
              </tr>
            </thead>
            <tbody>
              {reprogramaciones.map((cambio) => (
                <tr key={cambio.id}>
                  <td>{fechaHora(cambio.registradaEn)}</td>
                  <td>{formatearFecha(cambio.fechaAnterior)} → {formatearFecha(cambio.fechaNueva)}</td>
                  <td>{cambio.motivo}</td>
                  <td>{cambio.incidenciaId ? tipo(tipoDe.get(String(cambio.incidenciaId))) : "—"}</td>
                  <td>usuario #{cambio.registradaPorUsuarioId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Incidencias</h3>
      {incidencias.length === 0 ? (
        <p className="ts-empty">La ruta no tiene incidencias registradas.</p>
      ) : (
        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption>Incidencias registradas en la ruta</caption>
            <thead>
              <tr>
                <th scope="col">Registrada</th>
                <th scope="col">Tipo</th>
                <th scope="col">Entrega</th>
                <th scope="col">Motivo</th>
                <th scope="col">Autor</th>
              </tr>
            </thead>
            <tbody>
              {incidencias.map((incidencia) => (
                <tr key={incidencia.id}>
                  <td>{fechaHora(incidencia.registradaEn)}</td>
                  <td>{tipo(incidencia.tipo)}</td>
                  <td>{entrega(incidencia.paradaId)}</td>
                  <td>{incidencia.motivo}</td>
                  <td>usuario #{incidencia.registradaPorUsuarioId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
