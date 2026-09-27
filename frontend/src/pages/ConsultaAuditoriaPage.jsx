import { useEffect, useState } from "react";
import { obtenerAuditoria } from "../services/api.js";
import "../styles/consulta-auditoria.css";

const TAMANO_PAGINA = 8;
const esDemostracion = import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1";
const auditoriaEjemplo = [
  { id: "1", usuario_actor_nombre: "Ana Pérez", accion: "CREAR_USUARIO", usuario_afectado_nombre: "Pedro Rojas", fecha_hora: "2026-09-25T13:20:00Z" },
  { id: "2", usuario_actor_nombre: "Ana Pérez", accion: "CAMBIAR_ROL", usuario_afectado_nombre: "Lucía Vargas", fecha_hora: "2026-09-25T15:12:00Z" },
  { id: "3", usuario_actor_nombre: "José Flores", accion: "DESACTIVAR_USUARIO", usuario_afectado_nombre: "Pedro Rojas", fecha_hora: "2026-09-26T18:45:00Z" },
  { id: "4", usuario_actor_nombre: "Ana Pérez", accion: "ACTIVAR_USUARIO", usuario_afectado_nombre: "Pedro Rojas", fecha_hora: "2026-09-26T19:05:00Z" },
  { id: "5", usuario_actor_nombre: "Ana Pérez", accion: "CREAR_USUARIO", usuario_afectado_nombre: "María Soto", fecha_hora: "2026-09-26T19:10:00Z" },
  { id: "6", usuario_actor_nombre: "José Flores", accion: "CAMBIAR_ROL", usuario_afectado_nombre: "María Soto", fecha_hora: "2026-09-26T19:25:00Z" },
  { id: "7", usuario_actor_nombre: "Ana Pérez", accion: "ACTIVAR_USUARIO", usuario_afectado_nombre: "Lucía Vargas", fecha_hora: "2026-09-26T20:15:00Z" },
  { id: "8", usuario_actor_nombre: "José Flores", accion: "CAMBIAR_ROL", usuario_afectado_nombre: "Pedro Rojas", fecha_hora: "2026-09-26T20:50:00Z" },
  { id: "9", usuario_actor_nombre: "Ana Pérez", accion: "DESACTIVAR_USUARIO", usuario_afectado_nombre: "Lucía Vargas", fecha_hora: "2026-09-26T21:10:00Z" },
  { id: "10", usuario_actor_nombre: "Ana Pérez", accion: "CREAR_USUARIO", usuario_afectado_nombre: "Carla Mendoza", fecha_hora: "2026-09-26T22:10:00Z" },
];

function nombreUsuario(registro, tipo) {
  const id = registro[`usuario_${tipo}_id`];
  const nombre = registro[`usuario_${tipo}_nombre`] ?? registro[`usuario_${tipo}`]?.nombre_completo;
  return nombre ?? (id != null ? `Usuario #${id}` : tipo === "actor" ? "Sistema" : "—");
}

function fechaRegistro(valor) {
  if (!valor) return { fecha: "—", hora: "—", orden: "" };
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return { fecha: "—", hora: "—", orden: "" };
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(fecha);
  const campo = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return {
    fecha: new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", year: "numeric" }).format(fecha),
    hora: new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hour12: false }).format(fecha),
    orden: `${campo("year")}-${campo("month")}-${campo("day")}`,
  };
}

export default function ConsultaAuditoriaPage() {
  const [registros, setRegistros] = useState(esDemostracion ? auditoriaEjemplo : []);
  const [cargando, setCargando] = useState(!esDemostracion);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [usuario, setUsuario] = useState("");
  const [accion, setAccion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    if (esDemostracion) return;
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
  const filtrados = registros.filter((registro) => {
    const fecha = fechaRegistro(registro.fecha_hora).orden;
    const texto = `${nombreUsuario(registro, "actor")} ${nombreUsuario(registro, "afectado")}`.toLocaleLowerCase("es-BO");
    return texto.includes(usuario.toLocaleLowerCase("es-BO")) &&
      (!accion || registro.accion === accion) &&
      (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
  }).sort((a, b) => (new Date(b.fecha_hora).getTime() || 0) - (new Date(a.fecha_hora).getTime() || 0));
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANO_PAGINA));
  const visibles = filtrados.slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA);
  const actualizar = (setter) => (evento) => { setter(evento.target.value); setPagina(1); };

  return (
    <section className="audit-page" aria-labelledby="audit-title">
      <header className="audit-heading">
        <div><h1 id="audit-title">Registro de auditoría</h1><p>Consulta las acciones registradas y los usuarios involucrados.</p></div>
        {!cargando && !error && <span>{registros.length} registros</span>}
      </header>

      {esDemostracion && <p className="audit-notice">Vista de ejemplo: estos registros son ficticios.</p>}
      {cargando && <p className="audit-feedback" role="status">Cargando auditoría…</p>}
      {error && <div className="audit-feedback audit-error" role="alert">
        <p>{error}</p><button type="button" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</button>
        {import.meta.env.DEV && <a href="?demo=1">Ver pantalla con datos de ejemplo</a>}
      </div>}
      {!cargando && !error && registros.length === 0 && <p className="audit-feedback">Todavía no hay registros de auditoría.
        {import.meta.env.DEV && <a href="?demo=1">Ver pantalla con datos de ejemplo</a>}
      </p>}

      {!cargando && !error && registros.length > 0 && <div className="audit-panel">
        <div className="audit-panel-title"><h2>Historial de acciones</h2><span>{filtrados.length} resultados</span></div>
        <div className="audit-filters">
          <label>Usuario<input type="search" value={usuario} onChange={actualizar(setUsuario)} placeholder="Buscar actor o afectado" /></label>
          <label>Acción<select value={accion} onChange={actualizar(setAccion)}><option value="">Todas</option>{acciones.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          <label>Desde<input type="date" value={desde} max={hasta || undefined} onChange={actualizar(setDesde)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde || undefined} onChange={actualizar(setHasta)} /></label>
          <button type="button" className="audit-clear" onClick={() => { setUsuario(""); setAccion(""); setDesde(""); setHasta(""); setPagina(1); }}>Limpiar</button>
        </div>
        {filtrados.length === 0 ? <p className="audit-empty">No hay registros que coincidan con los filtros.</p> : <>
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
