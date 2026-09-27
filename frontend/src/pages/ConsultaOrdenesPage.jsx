import { useEffect, useState } from "react";
import { obtenerOrdenesProduccion } from "../services/api.js";
import "../styles/consulta-ordenes.css";

const esDemostracion = import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1";
const ordenesEjemplo = [
  { id: "1", codigo: "OP-2026-001", producto_nombre: "Pan de molde integral", cantidad_solicitada: "240", fecha_programada: "2026-10-02", estado: "PLANIFICADA", responsable_nombre: "María Vargas" },
  { id: "2", codigo: "OP-2026-002", producto_nombre: "Fiambre de pollo", cantidad_solicitada: "80", fecha_programada: "2026-10-04", estado: "EN_PRODUCCION", responsable_nombre: "José Rojas" },
  { id: "3", codigo: "OP-2026-003", producto_nombre: "Empanadas", cantidad_solicitada: "120", fecha_programada: "2026-10-08", estado: "PENDIENTE", responsable_nombre: "María Vargas" },
];

function nombreProducto(orden) {
  return orden.producto_nombre ?? orden.receta?.producto_nombre ?? orden.codigo ?? "—";
}

function mostrarCantidad(valor) {
  const numero = Number(valor);
  return valor == null || valor === "" || !Number.isFinite(numero)
    ? "—"
    : new Intl.NumberFormat("es-BO", { maximumFractionDigits: 4 }).format(numero);
}

function mostrarFecha(valor) {
  return valor ? String(valor).slice(0, 10) : "—";
}

function mostrarEstado(valor) {
  return valor ? String(valor).replaceAll("_", " ") : "—";
}

function mostrarResponsable(orden) {
  return orden.responsable_nombre ?? orden.responsable?.nombre_completo ??
    (orden.responsable_usuario_id ?? orden.responsableUsuarioId ? `Usuario ${orden.responsable_usuario_id ?? orden.responsableUsuarioId}` : "—");
}

export default function ConsultaOrdenesPage() {
  const [ordenes, setOrdenes] = useState(esDemostracion ? ordenesEjemplo : []);
  const [cargando, setCargando] = useState(!esDemostracion);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [producto, setProducto] = useState("");
  const [estado, setEstado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    if (esDemostracion) return;
    const controller = new AbortController();
    setCargando(true);
    setError("");
    obtenerOrdenesProduccion(controller.signal)
      .then(setOrdenes)
      .catch((fallo) => {
        if (!controller.signal.aborted) setError(fallo.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [intento]);

  const ordenesVisibles = ordenes.filter((orden) => {
    const fecha = mostrarFecha(orden.fecha_programada ?? orden.fechaProgramada);
    return nombreProducto(orden).toLocaleLowerCase("es-BO").includes(producto.toLocaleLowerCase("es-BO")) &&
      (!estado || orden.estado === estado) &&
      (!desde || fecha >= desde) &&
      (!hasta || fecha <= hasta);
  });
  const enProduccion = ordenes.filter((orden) => orden.estado === "EN_PRODUCCION").length;
  const pendientes = ordenes.filter((orden) => orden.estado === "PENDIENTE").length;
  const finalizadas = ordenes.filter((orden) => orden.estado === "FINALIZADA").length;

  return (
    <section className="orders-page" aria-labelledby="orders-title">
      <header className="orders-heading">
        <div>
          <h1 id="orders-title">Órdenes de producción</h1>
          <p>Consulta las órdenes, su programación y el responsable asignado.</p>
        </div>
        {!cargando && !error && <span className="orders-count">{ordenes.length} órdenes registradas</span>}
      </header>

      {esDemostracion && <p className="orders-notice">Vista de ejemplo: uso de datos ficticiosnun.</p>}

      {!cargando && !error && (
        <div className="orders-summary" aria-label="Resumen de órdenes">
          <div className="orders-summary-card"><span>Total de órdenes</span><strong>{ordenes.length}</strong></div>
          <div className="orders-summary-card"><span>En producción</span><strong>{enProduccion}</strong></div>
          <div className="orders-summary-card"><span>Pendientes</span><strong>{pendientes}</strong></div>
          <div className="orders-summary-card"><span>Finalizadas</span><strong>{finalizadas}</strong></div>
        </div>
      )}

      {cargando && <p className="orders-feedback" role="status">Cargando órdenes…</p>}
      {error && (
        <div className="orders-feedback orders-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button>
        </div>
      )}
      {!cargando && !error && ordenes.length === 0 && (
        <p className="orders-feedback">Todavía no hay órdenes registradas.</p>
      )}
      {!cargando && !error && ordenes.length > 0 && (
        <div className="orders-panel">
          <div className="orders-panel-title"><h2>Listado de órdenes</h2><span>{ordenesVisibles.length} resultados</span></div>
          <div className="orders-filters">
            <label>Producto<input type="search" value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Buscar producto" /></label>
            <label>Estado<select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option><option value="PENDIENTE">Pendiente</option><option value="PLANIFICADA">Planificada</option><option value="EN_PRODUCCION">En producción</option><option value="FINALIZADA">Finalizada</option><option value="CANCELADA">Cancelada</option></select></label>
            <label>Desde<input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} /></label>
            <label>Hasta<input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} /></label>
            <button type="button" className="orders-clear" onClick={() => { setProducto(""); setEstado(""); setDesde(""); setHasta(""); }}>Limpiar</button>
          </div>
          {ordenesVisibles.length === 0 ? <p className="orders-empty">No hay órdenes que coincidan con estos filtros.</p> : (
          <div className="orders-table-wrap">
          <table className="orders-table">
            <caption>Listado de órdenes de producción</caption>
            <thead><tr><th scope="col">Código</th><th scope="col">Producto</th><th scope="col">Cantidad</th><th scope="col">Fecha programada</th><th scope="col">Estado</th><th scope="col">Responsable</th></tr></thead>
            <tbody>
              {ordenesVisibles.map((orden) => (
                <tr key={orden.id ?? orden.codigo}>
                  <td className="orders-code">{orden.codigo ?? "—"}</td>
                  <td>{nombreProducto(orden)}</td>
                  <td>{mostrarCantidad(orden.cantidad_solicitada ?? orden.cantidadSolicitada)}</td>
                  <td>{mostrarFecha(orden.fecha_programada ?? orden.fechaProgramada)}</td>
                  <td><span className={`orders-status orders-status--${orden.estado ?? "DESCONOCIDO"}`}>{mostrarEstado(orden.estado)}</span></td>
                  <td>{mostrarResponsable(orden)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          )}
        </div>
      )}
    </section>
  );
}
