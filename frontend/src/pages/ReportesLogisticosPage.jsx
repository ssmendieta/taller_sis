import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";
import { tienePermiso } from "../services/permisos.js";
import { PERMISO_CONSULTAR_RUTAS } from "../services/historialLogisticoService.js";
import { consultarReporteLogistico, FILTROS_REPORTE_LOGISTICO, parametrosReporteLogistico } from "../services/reportesLogisticosService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import FiltrosReporteLogistico from "../components/logistica/reportes/FiltrosReporteLogistico.jsx";
import VistaPreviaReporteLogistico from "../components/logistica/reportes/VistaPreviaReporteLogistico.jsx";
import "../styles/reportes-logisticos.css";

function ConsultaReporteLogistico() {
  const [filtros, setFiltros] = useState(FILTROS_REPORTE_LOGISTICO);
  const [aplicados, setAplicados] = useState(null);
  const [reporte, setReporte] = useState(null);
  const [errorFiltros, setErrorFiltros] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const solicitud = useRef(null);

  useEffect(() => {
    document.title = FORMATO_TITULO("Reportes logísticos");
    return () => solicitud.current?.abort();
  }, []);

  async function consultar(nuevos) {
    try { parametrosReporteLogistico(nuevos); }
    catch (fallo) { setErrorFiltros(fallo.message); return; }

    solicitud.current?.abort();
    const controlador = new AbortController();
    solicitud.current = controlador;
    setAplicados(nuevos);
    setErrorFiltros("");
    setError(null);
    setCargando(true);
    try {
      const respuesta = await consultarReporteLogistico(nuevos, { signal: controlador.signal });
      if (!controlador.signal.aborted) setReporte(respuesta);
    } catch (fallo) {
      if (controlador.signal.aborted) return;
      if (fallo.status === 401 || fallo.status === 403) setReporte(null);
      setError(fallo);
    } finally {
      if (!controlador.signal.aborted) setCargando(false);
    }
  }

  function limpiar() {
    solicitud.current?.abort();
    setFiltros(FILTROS_REPORTE_LOGISTICO);
    setAplicados(null);
    setReporte(null);
    setErrorFiltros("");
    setError(null);
    setCargando(false);
  }

  const filtrosEditados = reporte && Object.keys(FILTROS_REPORTE_LOGISTICO).some((campo) =>
    filtros[campo] !== (reporte.filtros[campo] ?? ""));
  const mensajeError = error?.status === 401 ? "Tu sesión expiró. Vuelve a ingresar."
    : error?.status === 403 ? "No tienes permiso para consultar reportes logísticos."
    : error instanceof TypeError ? "No se pudo conectar con el servicio de reportes." : error?.message;

  return <section className="ts-page" aria-label="Reportes logísticos">
    <PageHeader titulo="Reportes logísticos" descripcion="Consulta rutas, boletas, entregas e incidencias por período." />
    <div className="ts-panel">
      <div className="ts-panel-title"><h2>Filtros</h2></div>
      <p className="reporte-logistico-nota">Ambas fechas se incluyen. Las rutas usan su fecha programada y las boletas su fecha de creación en Bolivia. Cada estado filtra su propio listado.</p>
      <FiltrosReporteLogistico filtros={filtros} alCambiar={(nuevos) => { setFiltros(nuevos); setErrorFiltros(""); }}
        alConsultar={() => consultar(filtros)} alLimpiar={limpiar} error={errorFiltros} />
    </div>
    {cargando && <p role="status">Consultando reporte…{reporte && " Se conserva la vista previa anterior mientras llega la respuesta."}</p>}
    {error && <div className="ts-feedback reporte-logistico-nota" role="alert">
      <p>{mensajeError}</p>
      {reporte && <p>La vista previa conserva el último resultado disponible.</p>}
      {error.status === 401 ? <Link className="ts-btn" to="/login">Volver a ingresar</Link> :
        <button type="button" className="ts-btn" onClick={() => consultar(aplicados)}>Reintentar</button>}
    </div>}
    {filtrosEditados && <p role="status">La vista previa corresponde a los filtros aplicados anteriormente. Consulta de nuevo para actualizarla.</p>}
    {reporte && <VistaPreviaReporteLogistico reporte={reporte} />}
    {!aplicados && <p className="ts-empty">Elige un período y pulsa Consultar reporte.</p>}
  </section>;
}

export default function ReportesLogisticosPage() {
  const { usuario } = useSesion();
  if (!tienePermiso(usuario, PERMISO_CONSULTAR_RUTAS)) {
    return <p className="ts-feedback ts-error" role="alert">No tienes permiso para consultar reportes logísticos.</p>;
  }
  return <ConsultaReporteLogistico key={usuario.id} />;
}
