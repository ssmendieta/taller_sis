import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { consultarReporteProduccion, FILTROS_REPORTE_INICIALES, PERMISO_REPORTES_PRODUCCION, validarFiltrosReporte } from "../services/reportesProduccionService.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import FiltrosReporteProduccion from "../components/produccion/reportes/FiltrosReporteProduccion.jsx";
import VistaPreviaReporteProduccion from "../components/produccion/reportes/VistaPreviaReporteProduccion.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

function mensajeError(error) {
  if (error.status === 401) return "Tu sesión expiró. Vuelve a ingresar para consultar el reporte.";
  if (error.status === 403) return "No tienes permiso para consultar reportes de producción.";
  return error.message || "No se pudo cargar el reporte de producción. Intenta de nuevo.";
}

function filtrosDiferentes(edicion, efectivos) {
  return Object.keys(FILTROS_REPORTE_INICIALES).some((campo) => (edicion[campo]?.trim() || "") !== (efectivos[campo] || ""));
}

export default function ReportesProduccionPage() {
  const { usuario } = useSesion();
  const puedeConsultar = tienePermiso(usuario, PERMISO_REPORTES_PRODUCCION);
  const identidad = usuario?.id ?? usuario?.sub;
  const [edicion, setEdicion] = useState(FILTROS_REPORTE_INICIALES);
  const [aplicados, setAplicados] = useState({});
  // El reporte conserva sin cambios sus filtros efectivos para ABC-338.
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [errorFiltros, setErrorFiltros] = useState("");
  const secuencia = useRef(0);
  const controlador = useRef(null);

  const cargar = useCallback(async (filtros) => {
    if (!puedeConsultar) return;
    let consulta;
    try { consulta = validarFiltrosReporte(filtros); }
    catch (fallo) { setErrorFiltros(fallo.message); return; }
    const solicitud = ++secuencia.current;
    controlador.current?.abort();
    controlador.current = new AbortController();
    setAplicados(consulta);
    setErrorFiltros("");
    setCargando(true);
    setError(null);
    try {
      const respuesta = await consultarReporteProduccion(consulta, { signal: controlador.current.signal });
      if (solicitud === secuencia.current) setReporte(respuesta);
    } catch (fallo) {
      if (solicitud === secuencia.current && fallo.name !== "AbortError") {
        if (fallo.status === 401 || fallo.status === 403) setReporte(null);
        setError(fallo);
      }
    } finally {
      if (solicitud === secuencia.current) setCargando(false);
    }
  }, [puedeConsultar, identidad]);

  useEffect(() => {
    document.title = FORMATO_TITULO("Reportes de producción");
    setReporte(null);
    setEdicion(FILTROS_REPORTE_INICIALES);
    setAplicados({});
    setError(null);
    setErrorFiltros("");
    if (puedeConsultar) void cargar({});
    return () => { ++secuencia.current; controlador.current?.abort(); };
  }, [cargar, puedeConsultar]);

  if (!puedeConsultar) return <section className="ts-denied" role="alert"><h1>Acceso denegado</h1><p>No tienes permiso para consultar reportes de producción.</p></section>;
  const accesoRechazado = error?.status === 401 || error?.status === 403;
  return <section className="ts-page" aria-label="Reportes de producción">
    <PageHeader titulo="Reportes de producción" descripcion="Vista previa por período y producto, con las cantidades y unidades del reporte consultado." />
    <div className="ts-panel">
      <div className="ts-panel-title"><h2>Filtros</h2></div>
      <p style={{ padding: "0 20px" }}>El período selecciona órdenes por su fecha programada e incluye todos sus registros. El producto se busca por código o nombre; cuando hay cierre se usan sus datos históricos.</p>
      <FiltrosReporteProduccion filtros={edicion} alCambiar={setEdicion} alAplicar={() => cargar(edicion)}
        alLimpiar={() => { setEdicion(FILTROS_REPORTE_INICIALES); void cargar({}); }} error={errorFiltros} />
    </div>
    <p>Las pérdidas y los reprocesos son acumulados actuales, incluso cuando las cantidades principales y los consumos provienen de un cierre.
      Lo recuperado no se suma a la producción ni a los conformes.</p>
    {cargando && <p role="status" aria-live="polite">Cargando reporte…{reporte ? " Se conserva la consulta anterior mientras se actualiza." : ""}</p>}
    {error && <div className="ts-feedback" role="alert" style={{ padding: 16 }}>
      <p>{mensajeError(error)}</p>
      {reporte && !accesoRechazado && <p>No se actualizó la vista previa. Se conserva el último reporte consultado.</p>}
      <button type="button" className="ts-btn" onClick={() => cargar(aplicados)}>Reintentar</button>
      {error.status === 401 && <Link className="ts-btn" to="/login">Volver a ingresar</Link>}
    </div>}
    {reporte && !accesoRechazado && <>
      {filtrosDiferentes(edicion, reporte.filtros) && <p role="status">El reporte mostrado corresponde a filtros anteriores a los que estás editando. Pulsa Consultar reporte para actualizarlos.</p>}
      <VistaPreviaReporteProduccion reporte={reporte} />
    </>}
  </section>;
}
