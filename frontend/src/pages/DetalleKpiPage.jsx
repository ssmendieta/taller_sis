import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";
import { BadgeEstadoOrden } from "../components/ui/Badges.jsx";
import SelectorPeriodo from "../components/logistica/dashboard/SelectorPeriodo.jsx";
import { AREAS_KPI, formatearKpi, mensajeErrorKpi, NOMBRES_KPI } from "../services/kpis.js";
import { ESTADOS_RUTA } from "../services/historialLogisticoService.js";
import { FORMATO_TITULO } from "../constants/marca.js";
import "../styles/dashboard-logistica.css";

const formato = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 4 });
const cantidad = (c) => (c ? `${formato.format(Number(c.valor))} ${c.unidad}` : "—");
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" }) : "—");
const fecha = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const enlaceOrden = (r) => <Link to={`/ordenes/${r.id}`}>{r.codigo}</Link>;

// Columnas propias de cada KPI de órdenes; la primera columna siempre enlaza a la orden.
const COLUMNAS_ORDEN = {
  FPY: [
    { titulo: "Conformes a la primera", num: true, celda: (r) => formato.format(r.conformes_primera) },
    { titulo: "Evaluadas", num: true, celda: (r) => formato.format(r.evaluadas) },
  ],
  CUMPLIMIENTO_FECHA: [
    { titulo: "Fecha requerida", celda: (r) => fecha(r.fecha_programada) },
    { titulo: "Finalizada", celda: (r) => fechaHora(r.finalizada_en) },
    { titulo: "Resultado", celda: (r) => (r.a_tiempo ? "A tiempo" : "Tarde") },
  ],
  TIEMPO_CICLO: [
    { titulo: "Iniciada", celda: (r) => fechaHora(r.iniciada_en) },
    { titulo: "Finalizada", celda: (r) => fechaHora(r.finalizada_en) },
  ],
};

function TablaOrdenes({ registros, unidad, kpi }) {
  const columnas = COLUMNAS_ORDEN[kpi] ?? [];
  return (
    <table className="ts-table">
      <thead>
        <tr>
          <th scope="col">Orden</th><th scope="col">Estado</th>
          {columnas.map((c) => <th key={c.titulo} scope="col" className={c.num ? "ts-num" : undefined}>{c.titulo}</th>)}
          <th scope="col" className="ts-num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {registros.map((r) => (
          <tr key={r.id}>
            <td>{enlaceOrden(r)}</td>
            <td><BadgeEstadoOrden estado={r.estado} /></td>
            {columnas.map((c) => <td key={c.titulo} className={c.num ? "ts-num" : undefined}>{c.celda(r)}</td>)}
            <td className="ts-num">{formatearKpi(r.valor, unidad)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaRutas({ registros, unidad }) {
  return (
    <table className="ts-table">
      <thead>
        <tr>
          <th scope="col">Ruta</th><th scope="col">Fecha</th><th scope="col">Vehículo</th><th scope="col">Estado</th>
          <th scope="col" className="ts-num">Carga</th>
          <th scope="col" className="ts-num">Capacidad</th>
          <th scope="col" className="ts-num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {registros.map((r) => (
          <tr key={r.id}>
            <td><Link to={`/logistica/rutas/${r.id}`}>{r.codigo}</Link></td>
            <td>{r.fecha}</td>
            <td>{r.placa ?? r.vehiculo_externo_id}</td>
            <td><span className={`ts-badge ${ESTADOS_RUTA[r.estado]?.clase ?? ""}`}>{ESTADOS_RUTA[r.estado]?.texto ?? r.estado}</span></td>
            <td className="ts-num">{cantidad(r.carga)}</td>
            <td className="ts-num">{cantidad(r.capacidad)}</td>
            <td className="ts-num">{r.valor === null ? <>No calculable<br /><small>{r.detalle}</small></> : formatearKpi(r.valor, unidad)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// TIEMPO_ATENCION: cada solicitud enlaza a su trazabilidad y a la ruta que la completó.
function TablaSolicitudes({ registros, unidad }) {
  return (
    <table className="ts-table">
      <thead>
        <tr>
          <th scope="col">Solicitud</th><th scope="col">Creada</th><th scope="col">Entregada</th>
          <th scope="col">Ruta</th><th scope="col" className="ts-num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {registros.map((r) => (
          <tr key={r.id}>
            <td><Link to={`/logistica/trazabilidad?ordenId=${encodeURIComponent(r.orden_id)}`}>{r.codigo}</Link></td>
            <td>{fechaHora(r.creado_en)}</td>
            <td>{fechaHora(r.entregada_en)}</td>
            <td>{r.ruta_id ? <Link to={`/logistica/rutas/${r.ruta_id}`}>{`Ruta ${r.ruta_id}`}</Link> : "—"}</td>
            <td className="ts-num">{formatearKpi(r.valor, unidad)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CausasDefecto({ causas, total }) {
  return (
    <section aria-label="Causas de defecto">
      <h2>Causas de defecto</h2>
      {causas.length === 0 ? <p className="ts-empty">Sin unidades defectuosas en el período.</p> : (
        <table className="ts-table">
          <thead><tr><th scope="col">Causa</th><th scope="col" className="ts-num">Unidades</th></tr></thead>
          <tbody>
            {causas.map((c) => <tr key={c.causa}><td>{c.causa}</td><td className="ts-num">{formato.format(c.cantidad)}</td></tr>)}
          </tbody>
          <tfoot><tr><th scope="row">Total defectuosas</th><td className="ts-num">{formato.format(total)}</td></tr></tfoot>
        </table>
      )}
    </section>
  );
}

// ABC-513: registros detrás de un KPI. El período vive en la dirección, así se conserva
// al abrir una orden o ruta y volver.
export default function DetalleKpiPage({ area }) {
  const { kpi } = useParams();
  const [params, setParams] = useSearchParams();
  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";
  const { detalle, tablero } = AREAS_KPI[area];
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const ultima = useRef(0);
  const nombre = NOMBRES_KPI[kpi] ?? kpi;

  const cargar = useCallback(async () => {
    const consulta = ++ultima.current;
    setCargando(true);
    setError("");
    setDatos(null);
    try {
      const respuesta = await detalle(kpi, { desde, hasta });
      if (consulta === ultima.current) setDatos(respuesta);
    } catch (fallo) {
      if (consulta === ultima.current) setError(mensajeErrorKpi(fallo));
    } finally {
      if (consulta === ultima.current) setCargando(false);
    }
  }, [detalle, kpi, desde, hasta]);

  useEffect(() => {
    document.title = FORMATO_TITULO(`Detalle: ${nombre}`);
    cargar();
    return () => { ultima.current += 1; };
  }, [cargar, nombre]);

  function cambiarPeriodo(p) {
    setParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v)));
  }

  const Tabla = area === "produccion" ? TablaOrdenes : kpi === "TIEMPO_ATENCION" ? TablaSolicitudes : TablaRutas;
  return (
    <section className="ts-page dash-detalle" aria-label={`Detalle de ${nombre}`} aria-busy={cargando}>
      <Link to={tablero}>← Volver al tablero</Link>
      <PageHeader titulo={nombre} descripcion="Registros que componen el valor del KPI en el período." />
      <SelectorPeriodo key={`${desde}|${hasta}`} periodo={{ desde, hasta }} alCambiar={cambiarPeriodo} deshabilitado={cargando} />
      {error && (
        <div className="ts-feedback ts-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
        </div>
      )}
      {cargando && <p className="ts-empty">Cargando detalle…</p>}
      {datos && !datos.disponible && <p className="ts-empty">El detalle de este KPI todavía no está disponible.</p>}
      {datos?.disponible && (
        <>
          <div className="dash-cifras">
            <div className="dash-cifra"><span>Valor del KPI</span><strong>{formatearKpi(datos.valor, datos.unidad)}</strong></div>
            <div className="dash-cifra"><span>Registros</span><strong>{formato.format(datos.registros.length)}</strong></div>
          </div>
          {datos.registros.length === 0
            ? <p className="ts-empty">Sin registros en el período.</p>
            : <div className="ts-table-wrap"><Tabla registros={datos.registros} unidad={datos.unidad} kpi={kpi} /></div>}
          {datos.causas_defecto && <CausasDefecto causas={datos.causas_defecto} total={datos.unidades_defectuosas} />}
        </>
      )}
    </section>
  );
}
