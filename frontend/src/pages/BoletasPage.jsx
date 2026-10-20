import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { listarBoletas, PERMISO_CONSULTAR_BOLETAS, PERMISO_CONSULTAR_SOLICITUDES, PERMISO_GESTIONAR_SOLICITUDES } from "../services/boletasService.js";
import { obtenerOrden } from "../services/ordenesService.js";
import { formatearFechaHora } from "../utils/format.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// Cada estado documental con su propio color: las anuladas no se confunden con las emitidas.
const ESTADOS = {
  BORRADOR: { texto: "Borrador", clase: "ts-badge--PLANIFICADA" },
  EMITIDA: { texto: "Emitida", clase: "ts-badge--FINALIZADA" },
  ANULADA: { texto: "Anulada", clase: "ts-badge--CANCELADA" },
};

const FILTROS_INICIALES = { orden: "", estado: "", limit: 10 };
const RESULTADO_VACIO = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar boletas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudieron cargar las boletas.";
}

export default function BoletasPage() {
  const { usuario } = useSesion();
  const [resultado, setResultado] = useState(RESULTADO_VACIO);
  const [codigosOrden, setCodigosOrden] = useState({});
  const [orden, setOrden] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [limite, setLimite] = useState(10);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIALES);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const ultimaCarga = useRef(0);
  const puedeConsultar = tienePermiso(usuario, PERMISO_CONSULTAR_BOLETAS);
  const puedeConsultarOrdenes = tienePermiso(usuario, "ordenes.consultar");

  const cargar = useCallback(async (filtros, pagina) => {
    if (!puedeConsultar) return;
    const carga = ++ultimaCarga.current;
    setCargando(true);
    setError("");

    try {
      const respuesta = await listarBoletas({ ...filtros, page: pagina });
      if (!Array.isArray(respuesta?.items)) throw new Error("El servidor devolvió un listado de boletas inválido.");
      const codigos = {};
      // La relación guardada contiene el ID. El nombre se consulta solo con permiso de Producción.
      if (puedeConsultarOrdenes && carga === ultimaCarga.current) {
        const ids = [...new Set(respuesta.items.map((boleta) => boleta.solicitudSalida?.ordenId).filter((id) => id != null))];
        const ordenes = await Promise.allSettled(ids.map((id) => obtenerOrden(id)));
        ordenes.forEach((consulta, indice) => {
          if (consulta.status === "fulfilled" && consulta.value?.codigo) codigos[ids[indice]] = consulta.value.codigo;
        });
      }
      if (carga !== ultimaCarga.current) return;
      setResultado(respuesta);
      setCodigosOrden(codigos);
    } catch (fallo) {
      if (carga !== ultimaCarga.current) return;
      setResultado(RESULTADO_VACIO);
      setCodigosOrden({});
      setError(mensajeError(fallo));
    } finally {
      if (carga === ultimaCarga.current) setCargando(false);
    }
  }, [puedeConsultar, puedeConsultarOrdenes]);

  useEffect(() => {
    cargar(FILTROS_INICIALES, 1);
    document.title = FORMATO_TITULO("Boletas");
    return () => { ultimaCarga.current += 1; };
  }, [cargar]);

  function aplicarFiltros(evento) {
    evento.preventDefault();
    const filtros = { orden: orden.trim(), estado: estadoFiltro, limit: limite };
    setFiltrosAplicados(filtros);
    cargar(filtros, 1);
  }

  function limpiarFiltros() {
    setOrden("");
    setEstadoFiltro("");
    setLimite(FILTROS_INICIALES.limit);
    setFiltrosAplicados(FILTROS_INICIALES);
    cargar(FILTROS_INICIALES, 1);
  }

  if (!puedeConsultar) return <p className="ts-feedback ts-error" role="alert">No tienes permiso para consultar boletas.</p>;
  const boletas = resultado.items;

  return (
    <section className="ts-page" aria-labelledby="boletas-titulo">
      <PageHeader
        titulo="Boletas de envío"
        descripcion="Documentos de salida generados desde solicitudes de salida."
        conteo={!cargando && !error ? `${resultado.total} ${resultado.total === 1 ? "boleta" : "boletas"}` : null}
        accion={<div className="ts-btn-group">
          {(tienePermiso(usuario, PERMISO_CONSULTAR_SOLICITUDES) || tienePermiso(usuario, PERMISO_GESTIONAR_SOLICITUDES)) && <Link className="ts-btn" to="/logistica/inicio">Solicitudes de salida</Link>}
          {tienePermiso(usuario, "logistica.boletas.gestionar") && <Link className="ts-btn ts-btn-primary" to="/logistica/boletas/nueva">Crear boleta</Link>}
        </div>}
      />

      <div className="ts-panel">
        <div className="ts-panel-title">
          <h2 id="boletas-titulo">Boletas</h2>
          {!cargando && !error && <span>{`${resultado.total} ${resultado.total === 1 ? "boleta" : "boletas"}`}</span>}
        </div>

        <form onSubmit={aplicarFiltros} aria-label="Filtros de boletas">
          <div className="ts-filters">
            <label htmlFor="boletas-orden">Código de orden
              <input id="boletas-orden" type="text" value={orden} maxLength={100}
                placeholder="Ej. ORD-2026-00007" onChange={(evento) => setOrden(evento.target.value)} />
            </label>
            <label htmlFor="boletas-estado">Estado
              <select id="boletas-estado" value={estadoFiltro} onChange={(evento) => setEstadoFiltro(evento.target.value)}>
                <option value="">Todos</option>
                {Object.keys(ESTADOS).map((estado) => <option key={estado} value={estado}>{estado}</option>)}
              </select>
            </label>
            <label htmlFor="boletas-limite">Registros por página
              <select id="boletas-limite" value={limite} onChange={(evento) => setLimite(Number(evento.target.value))}>
                {[5, 10, 20].map((cantidad) => <option key={cantidad} value={cantidad}>{cantidad}</option>)}
              </select>
            </label>
          </div>
          <div className="ts-btn-group" style={{ marginTop: "1rem" }}>
            <button type="submit" className="ts-btn ts-btn-primary" disabled={cargando}>Aplicar / actualizar</button>
            <button type="button" className="ts-btn" onClick={limpiarFiltros} disabled={cargando}>Limpiar filtros</button>
          </div>
        </form>

        {cargando ? (
          <p className="ts-feedback" role="status">Cargando boletas…</p>
        ) : error ? (
          <div className="ts-feedback ts-error" role="alert">
            <p>{error}</p>
            <button type="button" className="ts-btn" onClick={() => cargar(filtrosAplicados, resultado.page)}>Reintentar</button>
          </div>
        ) : boletas.length === 0 ? (
          <p className="ts-empty">No se encontraron boletas para los filtros aplicados.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Boletas de envío guardadas</caption>
              <thead>
                <tr>
                  <th scope="col">Número</th>
                  <th scope="col">Orden</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Solicitud de salida</th>
                  <th scope="col" className="ts-num">Ítems</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {boletas.map((b) => {
                  const estado = ESTADOS[b.estado];
                  const { fecha, hora } = formatearFechaHora(b.creadoEn);

                  return (
                    <tr key={b.id}>
                      <td className="ts-code">{b.numero}</td>
                      <td className="ts-code">{codigosOrden[b.solicitudSalida?.ordenId] ?? (b.solicitudSalida?.ordenId != null ? `Orden #${b.solicitudSalida.ordenId}` : "—")}</td>
                      <td>
                        <span className={`ts-badge ${estado?.clase ?? "ts-badge--inactivo"}`}>
                          {estado?.texto ?? b.estado}
                        </span>
                      </td>
                      <td>#{b.solicitudSalidaId}</td>
                      <td className="ts-num">{Array.isArray(b.items) ? b.items.length : "—"}</td>
                      <td>{fecha} {hora}</td>
                      <td>
                        <Link className="ts-btn ts-btn--sm" to={`/logistica/boletas/${b.id}`}>
                          Ver detalle
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!cargando && !error && (
          <nav className="ts-btn-group" aria-label="Paginación de boletas" style={{ marginTop: "1rem" }}>
            <span>Página {resultado.totalPages === 0 ? 0 : resultado.page} de {resultado.totalPages} · {resultado.total} resultado(s)</span>
            <button type="button" className="ts-btn" disabled={resultado.page <= 1 || resultado.totalPages === 0}
              onClick={() => cargar(filtrosAplicados, resultado.page - 1)}>Anterior</button>
            <button type="button" className="ts-btn" disabled={resultado.page >= resultado.totalPages}
              onClick={() => cargar(filtrosAplicados, resultado.page + 1)}>Siguiente</button>
          </nav>
        )}
      </div>
    </section>
  );
}
