import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listarParadasEnRiesgo } from "../../../services/logisticaService.js";
import { formatearFecha } from "../../../utils/format.js";

const MOTIVOS = {
  VENCIDA: { texto: "Vencida", clase: "ts-badge ts-badge--inactivo" },
  POR_VENCER: { texto: "Por vencer", clase: "ts-badge" },
};

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar las rutas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudieron cargar las entregas en riesgo.";
}

// ABC-459: paradas pendientes cuya fecha programada venció o vence dentro del margen
// (ABC-458). "Reprogramar" abre el detalle de la ruta, donde está el formulario de
// incidencia y reprogramación que ya existe.
export default function EntregasEnRiesgo({ puedeReprogramar }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const ultima = useRef(0);

  async function cargar() {
    const consulta = ++ultima.current;
    setCargando(true);
    setError("");
    try {
      const respuesta = await listarParadasEnRiesgo();
      if (consulta === ultima.current) setDatos(respuesta);
    } catch (fallo) {
      if (consulta === ultima.current) setError(mensajeError(fallo));
    } finally {
      if (consulta === ultima.current) setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    return () => { ultima.current += 1; };
  }, []);

  const paradas = datos?.paradas ?? [];

  return (
    <div className="ts-panel" aria-labelledby="entregas-riesgo-titulo" aria-busy={cargando}>
      <div className="ts-panel-title">
        <h2 id="entregas-riesgo-titulo">Entregas en riesgo</h2>
        {datos && <span>{`${paradas.length} ${paradas.length === 1 ? "parada" : "paradas"} · margen de ${datos.margenHoras} h`}</span>}
        <button type="button" className="ts-btn" onClick={cargar} disabled={cargando}>Actualizar</button>
      </div>

      {error ? (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
        </div>
      ) : cargando && !datos ? (
        <p className="ts-empty" role="status">Cargando entregas en riesgo…</p>
      ) : paradas.length === 0 ? (
        <p className="ts-empty">No hay entregas en riesgo de llegar tarde.</p>
      ) : (
        <div className="ts-table-wrap">
          <table className="ts-table">
            <caption className="sr-solo">Paradas pendientes con la fecha programada vencida o por vencer</caption>
            <thead>
              <tr>
                <th scope="col">Ruta</th>
                <th scope="col">Parada</th>
                <th scope="col">Fecha programada</th>
                <th scope="col">Motivo del riesgo</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {paradas.map((p) => (
                <tr key={p.paradaId} data-parada-id={p.paradaId}>
                  <td>{`Ruta #${p.rutaId}`}</td>
                  <td>{`${p.secuencia}. ${p.destino}`}</td>
                  <td>{formatearFecha(p.fechaProgramada)}</td>
                  <td>
                    <span className={MOTIVOS[p.motivo]?.clase ?? "ts-badge"}>{MOTIVOS[p.motivo]?.texto ?? p.motivo}</span>{" "}
                    {p.motivoDetalle}
                  </td>
                  <td>
                    <Link className="ts-btn ts-btn--sm" to={`/logistica/rutas/${encodeURIComponent(p.rutaId)}`}
                      aria-label={`${puedeReprogramar ? "Reprogramar" : "Ver"} ruta ${p.rutaId}`}>
                      {puedeReprogramar ? "Reprogramar" : "Ver ruta"}
                    </Link>
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
