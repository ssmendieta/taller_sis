import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerMetricasDashboardLogistica } from "../../../services/dashboardLogisticaService.js";
import GraficoBarrasEstado from "./GraficoBarrasEstado.jsx";
import SelectorPeriodo, { periodoUltimosDias } from "./SelectorPeriodo.jsx";
import "../../../styles/dashboard-logistica.css";

const formato = new Intl.NumberFormat("es-BO");

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar el tablero logístico.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudieron cargar las métricas logísticas.";
}

// Convierte la respuesta de ABC-328 en las series de cada gráfico.
export function seriesDashboard(m) {
  return {
    boletas: {
      total: m.boletas_por_estado.total,
      datos: [
        { clave: "EMITIDA", etiqueta: "Emitidas", valor: m.boletas_por_estado.EMITIDA },
        { clave: "BORRADOR", etiqueta: "Borrador", valor: m.boletas_por_estado.BORRADOR },
        { clave: "ANULADA", etiqueta: "Anuladas", valor: m.boletas_por_estado.ANULADA },
      ],
    },
    rutas: {
      total: m.rutas_por_estado.total,
      datos: [
        { clave: "PLANIFICADA", etiqueta: "Planificadas", valor: m.rutas_por_estado.PLANIFICADA },
        { clave: "DESPACHADA", etiqueta: "En tránsito", valor: m.rutas_por_estado.DESPACHADA },
        { clave: "COMPLETADA", etiqueta: "Completadas", valor: m.rutas_por_estado.COMPLETADA },
        { clave: "CANCELADA", etiqueta: "Canceladas", valor: m.rutas_por_estado.CANCELADA },
      ],
    },
    entregas: {
      total: m.entregas.total_paradas,
      datos: [
        { clave: "ENTREGADA", etiqueta: "Entregadas", valor: m.entregas.entregadas },
        { clave: "PENDIENTE", etiqueta: "Pendientes", valor: m.entregas.pendientes },
        { clave: "ANULADA", etiqueta: "Anuladas", valor: m.entregas.anuladas },
      ],
    },
  };
}

// ABC-330: widgets de boletas, rutas y entregas que cambian con el período elegido
// (datos de ABC-328). El maquetado general del tablero corresponde a ABC-329.
export default function WidgetsDashboardLogistica() {
  const [periodo, setPeriodo] = useState(() => periodoUltimosDias(30));
  const [metricas, setMetricas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Una respuesta tardía de un período anterior no reemplaza a la del período actual.
  const ultima = useRef(0);

  const cargar = useCallback(async (filtro) => {
    const consulta = ++ultima.current;
    setCargando(true);
    setError("");
    try {
      const datos = await obtenerMetricasDashboardLogistica(filtro);
      if (consulta === ultima.current) setMetricas(datos);
    } catch (fallo) {
      if (consulta === ultima.current) setError(mensajeError(fallo));
    } finally {
      if (consulta === ultima.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(periodo);
  }, [cargar, periodo]);

  const series = metricas ? seriesDashboard(metricas) : null;
  const r = metricas?.resumen;

  return (
    <section className="dash-logistica" aria-label="Indicadores logísticos" aria-busy={cargando}>
      <SelectorPeriodo periodo={periodo} alCambiar={setPeriodo} deshabilitado={cargando} />

      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={() => cargar(periodo)}>Reintentar</button>
        </div>
      )}
      {!metricas && cargando && <p className="ts-empty">Cargando indicadores…</p>}

      {series && (
        <>
          <div className="dash-cifras" aria-live="polite">
            <div className="dash-cifra"><span>Rutas en tránsito</span><strong>{formato.format(r.rutas_en_curso)}</strong></div>
            <div className="dash-cifra"><span>Entregas completadas</span><strong>{`${r.porcentaje_entregas_completadas}%`}</strong></div>
            <div className="dash-cifra"><span>Boletas emitidas</span><strong>{formato.format(r.boletas_emitidas)}</strong></div>
            <div className="dash-cifra"><span>Incidencias</span><strong>{formato.format(r.total_incidencias)}</strong></div>
          </div>
          <div className="dash-graficos" data-cargando={cargando || undefined}>
            <GraficoBarrasEstado id="dash-boletas" titulo="Boletas por estado" unidad="boletas" {...series.boletas} />
            <GraficoBarrasEstado id="dash-rutas" titulo="Rutas por estado" unidad="rutas" {...series.rutas} />
            <GraficoBarrasEstado id="dash-entregas" titulo="Entregas por estado" unidad="entregas" {...series.entregas} />
          </div>
        </>
      )}
    </section>
  );
}
