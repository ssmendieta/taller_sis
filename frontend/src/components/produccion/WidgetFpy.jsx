import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { obtenerFpyProduccion } from "../../services/dashboardService.js";
import SelectorPeriodo, { periodoUltimosDias } from "../logistica/dashboard/SelectorPeriodo.jsx";
import "../../styles/dashboard-logistica.css";

const numero = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const pct = (v) => `${numero.format(v)}%`;

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar el tablero de producción.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudo cargar el FPY.";
}

// ABC-471: widget del FPY (conformes a la primera, sin reprocesos) con filtro de período.
export default function WidgetFpy() {
  const [periodo, setPeriodo] = useState(() => periodoUltimosDias(30));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Una respuesta tardía de un período anterior no reemplaza a la del actual.
  const ultima = useRef(0);

  const cargar = useCallback(async (filtro) => {
    const consulta = ++ultima.current;
    setCargando(true);
    setError("");
    try {
      const fpy = await obtenerFpyProduccion(filtro);
      if (consulta === ultima.current) setDatos(fpy);
    } catch (fallo) {
      if (consulta === ultima.current) setError(mensajeError(fallo));
    } finally {
      if (consulta === ultima.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(periodo);
  }, [cargar, periodo]);

  const consulta = new URLSearchParams(Object.entries(periodo).filter(([, v]) => v)).toString();
  const sinDatos = datos && (datos.fpy === null || datos.evaluadas === 0);

  return (
    <section className="dash-logistica" aria-label="Conformes a la primera (FPY)" aria-busy={cargando}>
      <SelectorPeriodo periodo={periodo} alCambiar={setPeriodo} deshabilitado={cargando} />

      <figure className="dash-grafico" aria-labelledby="widget-fpy-titulo">
        <figcaption className="dash-grafico-cabecera">
          <h3 id="widget-fpy-titulo">Conformes a la primera (FPY)</h3>
          {datos && !error && (
            <span className="dash-grafico-total" aria-live="polite">{sinDatos ? "Sin datos" : pct(datos.fpy)}</span>
          )}
        </figcaption>

        {cargando && !datos && <p className="ts-empty">Cargando FPY…</p>}
        {error && (
          <div className="ts-feedback ts-error" role="alert">
            <p>{error}</p>
            <button type="button" className="ts-btn" onClick={() => cargar(periodo)}>Reintentar</button>
          </div>
        )}

        {datos && !error && (sinDatos ? (
          <p className="ts-empty">Sin unidades evaluadas en el período.</p>
        ) : (
          <p className="dash-nota">
            {`${numero.format(datos.conformesPrimera)} de ${numero.format(datos.evaluadas)} unidades evaluadas fueron conformes a la primera.`}
          </p>
        ))}

        <p className="dash-nota">
          Excluye las unidades que pasaron por reproceso, aunque luego fueran conformes.
          {datos && !sinDatos && !error && ` No es el porcentaje de conformes (${pct(datos.porcentajeConformes)}).`}
        </p>
        <div className="ts-btn-group">
          <Link className="ts-btn ts-btn--sm" to={`/produccion/kpis/FPY${consulta ? `?${consulta}` : ""}`}>Ver órdenes</Link>
        </div>
      </figure>
    </section>
  );
}
