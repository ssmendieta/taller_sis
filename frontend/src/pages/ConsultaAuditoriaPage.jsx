import { useEffect, useState } from "react";
import { obtenerAuditoria } from "../services/api.js";
import { FORMATO_TITULO } from "../constants/marca.js";
import { diaAuditoria, filtrarAuditoria, nombreUsuarioAuditoria, paginaAuditoria } from "../services/auditoriaFiltros.js";
import "../styles/consulta-auditoria.css";

const TAMANO_PAGINA = 8;

function nombreUsuario(registro, tipo) {
  return nombreUsuarioAuditoria(registro, tipo);
}

function fechaRegistro(valor) {
  if (!valor) return { fecha: "—", hora: "—", orden: "" };
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return { fecha: "—", hora: "—", orden: "" };
  return {
    fecha: new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha),
    hora: new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hour12: false }).format(fecha),
    orden: diaAuditoria(valor),
  };
}

export default function ConsultaAuditoriaPage() {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [usuario, setUsuario] = useState("");
  const [accion, setAccion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => { document.title = FORMATO_TITULO("Auditoría"); }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true);
    setError("");
    obtenerAuditoria(controller.signal)
      .then((datos) => { setRegistros(datos); setPagina(1); })
      .catch((fallo) => { if (!controller.signal.aborted) setError(fallo.message); })
      .finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, [intento]);

  const acciones = [...new Set(registros.map((registro) => registro.accion).filter(Boolean))].sort();
  const filtrados = filtrarAuditoria(registros, { usuario, accion, desde, hasta });
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANO_PAGINA));
  const visibles = paginaAuditoria(filtrados, pagina, TAMANO_PAGINA);
  const actualizar = (setter) => (evento) => { setter(evento.target.value); setPagina(1); };

  return (
    <section className="audit-page" aria-labelledby="audit-title">
      <header className="audit-heading">
        <div><h1 id="audit-title">Auditoría</h1></div>
        {!cargando && !error && <span>{registros.length} registros</span>}
      </header>

      {cargando && <p className="audit-feedback" role="status">Cargando auditoría…</p>}
      {error && <div className="audit-feedback audit-error" role="alert">
        <p>{error}</p><button type="button" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button>
      </div>}
      {!cargando && !error && registros.length === 0 && <p className="audit-feedback">Sin registros.</p>}

      {!cargando && !error && registros.length > 0 && <div className="audit-panel">
        <div className="audit-panel-title"><h2>Historial</h2><span>{filtrados.length} resultados</span></div>
        <div className="audit-filters">
          <label>Usuario<input type="search" value={usuario} onChange={actualizar(setUsuario)} placeholder="Buscar usuario" /></label>
          <label>Acción<select value={accion} onChange={actualizar(setAccion)}><option value="">Todas</option>{acciones.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          <label>Desde<input type="date" value={desde} max={hasta || undefined} onChange={actualizar(setDesde)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde || undefined} onChange={actualizar(setHasta)} /></label>
          <button type="button" className="audit-clear" onClick={() => { setUsuario(""); setAccion(""); setDesde(""); setHasta(""); setPagina(1); }}>Limpiar</button>
        </div>
        {filtrados.length === 0 ? <p className="audit-empty">Sin resultados.</p> : <>
          <div className="audit-table-wrap"><table className="audit-table">
            <caption>Historial de auditoría</caption>
            <thead><tr><th scope="col">Usuario</th><th scope="col">Acción</th><th scope="col">Usuario afectado</th><th scope="col">Fecha</th><th scope="col">Hora</th></tr></thead>
            <tbody>{visibles.map((registro) => {
              const { fecha, hora } = fechaRegistro(registro.fecha_hora);
              return <tr key={registro.id}><td>{nombreUsuario(registro, "actor")}</td><td className="audit-action">{registro.accion?.replaceAll("_", " ") ?? "—"}</td><td>{nombreUsuario(registro, "afectado")}</td><td>{fecha}</td><td>{hora}</td></tr>;
            })}</tbody>
          </table></div>
          <nav className="audit-pagination" aria-label="Paginación de auditoría">
            <span>Página {pagina} de {totalPaginas}</span>
            <div><button type="button" disabled={pagina === 1} onClick={() => setPagina((actual) => actual - 1)}>Anterior</button><button type="button" disabled={pagina === totalPaginas} onClick={() => setPagina((actual) => actual + 1)}>Siguiente</button></div>
          </nav>
        </>}
      </div>}
    </section>
  );
}
