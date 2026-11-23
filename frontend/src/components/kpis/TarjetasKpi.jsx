import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeSemaforo } from "../ui/Badges.jsx";
import { AREAS_KPI, formatearKpi, mensajeErrorKpi, NOMBRES_KPI } from "../../services/kpis.js";
import "../../styles/dashboard-logistica.css";

// ABC-497: valor, meta y semáforo de los KPIs del área. El color lo decide el backend
// con todo el historial; cada tarjeta abre el detalle de sus registros (ABC-513).
export default function TarjetasKpi({ area }) {
  const { listar } = AREAS_KPI[area];
  const [kpis, setKpis] = useState(null);
  const [error, setError] = useState("");
  const ultima = useRef(0);

  const cargar = useCallback(async () => {
    const consulta = ++ultima.current;
    setError("");
    try {
      const datos = await listar();
      if (consulta === ultima.current) setKpis(datos.kpis);
    } catch (fallo) {
      if (consulta === ultima.current) setError(mensajeErrorKpi(fallo));
    }
  }, [listar]);

  useEffect(() => {
    cargar();
    return () => { ultima.current += 1; };
  }, [cargar]);

  return (
    <section className="dash-kpis" aria-label="KPIs y metas" aria-busy={!kpis && !error}>
      <h2>KPIs y metas (todo el historial)</h2>
      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
        </div>
      )}
      {!kpis && !error && <p className="ts-empty">Cargando KPIs…</p>}
      {kpis?.length === 0 && <p className="ts-empty">No hay KPIs configurados.</p>}
      {kpis?.length > 0 && (
        <ul className="dash-kpis-lista">
          {kpis.map((k) => (
            <li key={k.kpi} className="dash-cifra">
              <span>{NOMBRES_KPI[k.kpi] ?? k.kpi}</span>
              <strong>{formatearKpi(k.valor, k.unidad)}</strong>
              <span>{k.meta === null ? "Sin meta" : `Meta: ${formatearKpi(k.meta, k.unidad)}`}</span>
              <BadgeSemaforo color={k.color} />
              <Link to={`/${area}/kpis/${k.kpi}`} aria-label={`Ver detalle de ${NOMBRES_KPI[k.kpi] ?? k.kpi}`}>Ver detalle</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
