import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import {
  consultarDisponibilidadLotes,
  crearBoleta,
  crearSolicitudSalida,
  listarBoletas,
  listarSolicitudesSalida,
} from "../services/boletasService.js";
import {
  cantidadAutorizadaPorSolicitud,
  cantidadSugerida,
  formatearEscalada,
  saldoDeLote,
  validarCantidadContraSolicitud,
  validarCantidadLote,
} from "../services/saldosLotes.js";
import { obtenerOrdenes } from "../services/ordenesService.js";
import { listarLotesOrden } from "../services/lotesService.js";
import { formatearCantidad, formatearFechaHora } from "../utils/format.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import Paginacion from "../components/ui/Paginacion.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";

// Cada estado documental con su propio color: las anuladas no se confunden con las emitidas.
const ESTADOS = {
  BORRADOR: { texto: "Borrador", clase: "ts-badge--PLANIFICADA" },
  EMITIDA: { texto: "Emitida", clase: "ts-badge--FINALIZADA" },
  ANULADA: { texto: "Anulada", clase: "ts-badge--CANCELADA" },
};

function mensajeError(fallo) {
  if (fallo?.status === 403) return "No tienes permiso para consultar boletas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudieron cargar las boletas.";
}

export default function BoletasPage() {
  const navigate = useNavigate();
  const { usuario } = useSesion();
  const puedeCrearSolicitud = tienePermiso(usuario, "logistica.solicitudes.gestionar");
  const puedeCrearBoleta = tienePermiso(usuario, "logistica.boletas.gestionar");
  const [boletas, setBoletas] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [saldosLotes, setSaldosLotes] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [nuevaSolicitud, setNuevaSolicitud] = useState({ ordenId: "", destinoDocumental: "", motivo: "", items: [{ referencia: "", cantidad: "", cantidadManual: false }] });
  const [solicitudId, setSolicitudId] = useState("");
  const [itemsBoleta, setItemsBoleta] = useState([]);
  const [errorFormulario, setErrorFormulario] = useState("");
  const [mensajeFormulario, setMensajeFormulario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [filtros, setFiltros] = useState({ orden: "", estado: "", fechaDesde: "", fechaHasta: "" });
  const [criterios, setCriterios] = useState({});
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Cada lote de la orden con su disponibilidad real (viene del backend).
  const opcionesLote = lotes.map((lote) => {
    const saldo = saldoDeLote(saldosLotes, lote.codigo);
    return { ...lote, disponible: saldo ? saldo.cantidadDisponible : null };
  });

  // La solicitud elegida: de ella vienen los lotes y las cantidades precargadas.
  const solicitudActual = solicitudes.find((item) => String(item.id) === solicitudId);

  async function cargar(filtroActual = criterios, paginaActual = pagina) {
    setCargando(true);
    setError("");

    try {
      const respuesta = await listarBoletas({ ...filtroActual, page: paginaActual, limit: 8 });
      setBoletas(Array.isArray(respuesta?.items) ? respuesta.items : []);
      setTotal(respuesta?.total ?? 0);
      setPaginas(respuesta?.totalPages ?? 0);
    } catch (fallo) {
      setBoletas([]);
      setTotal(0);
      setPaginas(0);
      setError(mensajeError(fallo));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar(criterios, pagina);
    document.title = FORMATO_TITULO("Boletas");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criterios, pagina]);

  useEffect(() => {
    if (!puedeCrearSolicitud && !puedeCrearBoleta) return;
    obtenerOrdenes().then(setOrdenes).catch((fallo) => setErrorFormulario(fallo.message));
    listarSolicitudesSalida().then(setSolicitudes).catch((fallo) => setErrorFormulario(fallo.message));
  }, [puedeCrearSolicitud, puedeCrearBoleta]);

  useEffect(() => {
    const orden = ordenes.find((item) => String(item.id) === nuevaSolicitud.ordenId);
    if (!orden) { setLotes([]); setSaldosLotes([]); return; }
    let vigente = true;
    listarLotesOrden(orden.codigo)
      .then((datos) => { if (vigente) setLotes(Array.isArray(datos) ? datos : []); })
      .catch((fallo) => { if (vigente) { setLotes([]); setErrorFormulario(fallo.message); } });
    // El saldo por lote lo calcula el backend: lo comprometido en boletas EMITIDAS.
    consultarDisponibilidadLotes(orden.codigo)
      .then((datos) => { if (vigente) setSaldosLotes(Array.isArray(datos?.lotes) ? datos.lotes : []); })
      .catch((fallo) => { if (vigente) { setSaldosLotes([]); setErrorFormulario(fallo.message); } });
    return () => { vigente = false; };
  }, [nuevaSolicitud.ordenId, ordenes]);

  function saldoDeReferencia(referencia) {
    return saldoDeLote(saldosLotes, referencia);
  }

  function cambiarItemSolicitud(indice, campo, valor) {
    setNuevaSolicitud((actual) => ({
      ...actual,
      items: actual.items.map((item, posicion) => posicion === indice
        ? { ...item, [campo]: valor, ...(campo === "cantidad" ? { cantidadManual: true } : {}) }
        : item),
    }));
  }

  // Al elegir un lote se precarga su disponibilidad; si el usuario ya había escrito
  // una cantidad a mano en ese mismo lote, no se pisa.
  function seleccionarLoteSolicitud(indice, referencia) {
    setNuevaSolicitud((actual) => ({
      ...actual,
      items: actual.items.map((item, posicion) => {
        if (posicion !== indice) return item;
        if (item.referencia === referencia) return item;
        const saldo = saldoDeReferencia(referencia);
        return { ...item, referencia, cantidad: cantidadSugerida(saldo), cantidadManual: false };
      }),
    }));
  }

  function usarTodoLoDisponible(indice) {
    setNuevaSolicitud((actual) => ({
      ...actual,
      items: actual.items.map((item, posicion) => {
        if (posicion !== indice) return item;
        const saldo = saldoDeReferencia(item.referencia);
        return { ...item, cantidad: cantidadSugerida(saldo), cantidadManual: false };
      }),
    }));
  }

  function validarNuevaSolicitud() {
    for (const item of nuevaSolicitud.items) {
      if (!item.referencia) return "Selecciona el lote de cada ítem de la solicitud.";
      const saldo = saldoDeReferencia(item.referencia);
      const revision = validarCantidadLote(item.cantidad, saldo, item.referencia);
      if (!revision.valido) return revision.mensaje;
    }
    return "";
  }

  function validarItemsBoleta() {
    const solicitud = solicitudes.find((item) => String(item.id) === solicitudId);
    for (const item of itemsBoleta) {
      if (!item.referencia) return "Selecciona la referencia de cada ítem de la boleta.";
      const revision = validarCantidadContraSolicitud(item.cantidad, solicitud?.items, item.referencia);
      if (!revision.valido) return revision.mensaje;
    }
    return "";
  }

  // Al cambiar la referencia de un ítem de la boleta se recarga la cantidad
  // autorizada por la solicitud; si no cambia, no se pisa lo editado a mano.
  function seleccionarReferenciaBoleta(indice, referencia) {
    setItemsBoleta((actual) => actual.map((valor, posicion) => {
      if (posicion !== indice) return valor;
      if (valor.referencia === referencia) return valor;
      const autorizada = cantidadAutorizadaPorSolicitud(solicitudActual?.items, referencia);
      return { ...valor, referencia, cantidad: formatearEscalada(autorizada) };
    }));
  }

  function seleccionarSolicitud(id) {
    setSolicitudId(id);
    const solicitud = solicitudes.find((item) => String(item.id) === id);
    setItemsBoleta((solicitud?.items ?? []).map((item) => ({ referencia: item.referencia, cantidad: item.cantidad })));
  }

  async function guardarSolicitud(evento) {
    evento.preventDefault();
    setErrorFormulario("");
    setMensajeFormulario("");

    const problema = validarNuevaSolicitud();
    if (problema) {
      setErrorFormulario(problema);
      return;
    }

    setGuardando(true);
    try {
      const solicitud = await crearSolicitudSalida({
        ...nuevaSolicitud,
        ordenId: String(nuevaSolicitud.ordenId),
        items: nuevaSolicitud.items.map((item) => ({ referencia: item.referencia, cantidad: String(item.cantidad) })),
      });
      setSolicitudes((actual) => [solicitud, ...actual]);
      seleccionarSolicitud(String(solicitud.id));
      setItemsBoleta(solicitud.items.map((item) => ({ referencia: item.referencia, cantidad: item.cantidad })));
      setMensajeFormulario(`Solicitud de salida #${solicitud.id} creada en BORRADOR.`);
    } catch (fallo) {
      setErrorFormulario(fallo?.status === 403 ? "No tienes permiso para crear solicitudes de salida." : fallo.message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarBoleta(evento) {
    evento.preventDefault();
    setErrorFormulario("");
    setMensajeFormulario("");

    const problema = validarItemsBoleta();
    if (problema) {
      setErrorFormulario(problema);
      return;
    }

    setGuardando(true);
    try {
      const boleta = await crearBoleta({ solicitudSalidaId: String(solicitudId), items: itemsBoleta.map((item) => ({ referencia: item.referencia, cantidad: String(item.cantidad) })) });
      navigate(`/logistica/boletas/${boleta.id}`);
    } catch (fallo) {
      setErrorFormulario(fallo?.status === 403 ? "No tienes permiso para crear boletas." : fallo.message);
    } finally {
      setGuardando(false);
    }
  }

  function aplicarFiltros(evento) {
    evento.preventDefault();
    setPagina(1);
    setCriterios({ ...filtros });
  }

  return (
    <section className="ts-page" aria-labelledby="boletas-titulo">
      <PageHeader
        titulo="Boletas de envío"
        descripcion="Documentos de salida generados desde solicitudes de salida."
        conteo={!cargando && !error ? `${total} ${total === 1 ? "boleta" : "boletas"}` : null}
      />

      <p className="ts-notice">Consulta las boletas registradas en el servidor y filtra por orden, estado o fecha.</p>

      {(puedeCrearSolicitud || puedeCrearBoleta) && (
        <div className="ts-panel ts-panel--form">
          <div className="ts-panel-title">
            <h2>Crear documentos de salida</h2>
          </div>
          {errorFormulario && <p className="ts-feedback ts-error" role="alert">{errorFormulario}</p>}
          {mensajeFormulario && <p className="ts-feedback ts-notice" role="status">{mensajeFormulario}</p>}
          {puedeCrearSolicitud && (
            <form onSubmit={guardarSolicitud}>
              <h3>1. Nueva solicitud de salida</h3>
              <div className="ts-filters">
                <label>Orden *
                  <select required value={nuevaSolicitud.ordenId} onChange={(evento) => setNuevaSolicitud({ ...nuevaSolicitud, ordenId: evento.target.value, items: [{ referencia: "", cantidad: "", cantidadManual: false }] })}>
                    <option value="">Seleccionar orden</option>
                    {ordenes.map((orden) => <option key={orden.id} value={orden.id}>{orden.codigo}</option>)}
                  </select>
                </label>
                <label>Destino documental *
                  <input required maxLength={250} value={nuevaSolicitud.destinoDocumental} onChange={(evento) => setNuevaSolicitud({ ...nuevaSolicitud, destinoDocumental: evento.target.value })} />
                </label>
                <label>Motivo *
                  <input required maxLength={500} value={nuevaSolicitud.motivo} onChange={(evento) => setNuevaSolicitud({ ...nuevaSolicitud, motivo: evento.target.value })} />
                </label>
              </div>
              <h4>Ítems de la solicitud</h4>
              {nuevaSolicitud.items.map((item, indice) => {
                const saldo = saldoDeReferencia(item.referencia);
                const disponible = saldo ? Number(saldo.cantidadDisponible) : null;
                return (
                  <div className="ts-filters" key={indice}>
                    <label>Lote *
                      <select required value={item.referencia} onChange={(evento) => seleccionarLoteSolicitud(indice, evento.target.value)}>
                        <option value="">Seleccionar lote</option>
                        {opcionesLote.map((lote) => (
                          <option key={lote.id} value={lote.codigo}>
                            {lote.codigo}{lote.disponible !== null ? " · disponible " + formatearCantidad(lote.disponible) : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>Cantidad *
                      <input required type="number" min="0.0001" max="9999999999.9999" step="0.0001" value={item.cantidad} onChange={(evento) => cambiarItemSolicitud(indice, "cantidad", evento.target.value)} />
                    </label>
                    {saldo && (
                      <p className="ts-notice" style={{ flex: "1 1 100%", margin: 0 }}>
                        Lote {saldo.referencia}: original {formatearCantidad(saldo.cantidadOriginal)} · comprometido en boletas emitidas {formatearCantidad(saldo.cantidadComprometida)} · disponible {formatearCantidad(saldo.cantidadDisponible)}
                      </p>
                    )}
                    {item.referencia && disponible !== null && disponible <= 0 && (
                      <p className="ts-feedback ts-error" style={{ flex: "1 1 100%" }} role="alert">
                        El lote {item.referencia} ya no tiene unidades disponibles.
                      </p>
                    )}
                    <button type="button" className="ts-btn ts-btn--sm" onClick={() => usarTodoLoDisponible(indice)} disabled={!saldo || disponible <= 0}>Usar todo lo disponible</button>
                    {nuevaSolicitud.items.length > 1 && <button type="button" className="ts-btn" onClick={() => setNuevaSolicitud((actual) => ({ ...actual, items: actual.items.filter((_, posicion) => posicion !== indice) }))}>Quitar ítem</button>}
                  </div>
                );
              })}
              <div className="ts-btn-group">
                <button type="button" className="ts-btn" onClick={() => setNuevaSolicitud((actual) => ({ ...actual, items: [...actual.items, { referencia: "", cantidad: "", cantidadManual: false }] }))}>Agregar ítem</button>
                <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando || lotes.length === 0}>Crear solicitud</button>
              </div>
              {nuevaSolicitud.ordenId && lotes.length === 0 && <p className="ts-notice">La orden seleccionada todavía no tiene lotes registrados.</p>}
            </form>
          )}
          {puedeCrearBoleta && (
            <form onSubmit={guardarBoleta}>
              <h3>2. Crear boleta en BORRADOR</h3>
              <div className="ts-filters">
                <label>Solicitud de salida *
                  <select required value={solicitudId} onChange={(evento) => seleccionarSolicitud(evento.target.value)}>
                    <option value="">Seleccionar solicitud</option>
                    {solicitudes.map((solicitud) => <option key={solicitud.id} value={solicitud.id}>#{solicitud.id} · orden #{solicitud.ordenId} · {solicitud.destinoDocumental}</option>)}
                  </select>
                </label>
              </div>
              {itemsBoleta.map((item, indice) => (
                <div className="ts-filters" key={indice}>
                  <label>Referencia *
                    <select required value={item.referencia} onChange={(evento) => seleccionarReferenciaBoleta(indice, evento.target.value)}>
                      <option value="">Seleccionar referencia</option>
                      {(solicitudActual?.items ?? []).map((solicitudItem) => <option key={solicitudItem.id} value={solicitudItem.referencia}>{solicitudItem.referencia}</option>)}
                    </select>
                  </label>
                  <label>Cantidad *
                    <input required type="number" min="0.0001" max="9999999999.9999" step="0.0001" value={item.cantidad} onChange={(evento) => setItemsBoleta((actual) => actual.map((valor, posicion) => posicion === indice ? { ...valor, cantidad: evento.target.value } : valor))} />
                  </label>
                  {item.referencia && (
                    <p className="ts-notice" style={{ flex: "1 1 100%", margin: 0 }}>
                      Autorizado por la solicitud: {formatearEscalada(cantidadAutorizadaPorSolicitud(solicitudActual?.items, item.referencia))}
                    </p>
                  )}
                  {itemsBoleta.length > 1 && <button type="button" className="ts-btn" onClick={() => setItemsBoleta((actual) => actual.filter((_, posicion) => posicion !== indice))}>Quitar ítem</button>}
                </div>
              ))}
              <div className="ts-btn-group">
                {solicitudId && <button type="button" className="ts-btn" onClick={() => setItemsBoleta((actual) => [...actual, { referencia: "", cantidad: "" }])}>Agregar ítem</button>}
                <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando || !solicitudId || itemsBoleta.length === 0}>Crear boleta</button>
              </div>
            </form>
          )}
        </div>
      )}

      <form className="ts-panel ts-filters" onSubmit={aplicarFiltros}>
        <label>Orden (código o ID)
          <input value={filtros.orden} onChange={(evento) => setFiltros({ ...filtros, orden: evento.target.value })} placeholder="ORD-2026-00001" />
        </label>
        <label>Estado
          <select value={filtros.estado} onChange={(evento) => setFiltros({ ...filtros, estado: evento.target.value })}>
            <option value="">Todos</option>
            <option value="BORRADOR">Borrador</option>
            <option value="EMITIDA">Emitida</option>
            <option value="ANULADA">Anulada</option>
          </select>
        </label>
        <label>Desde
          <input type="date" value={filtros.fechaDesde} onChange={(evento) => setFiltros({ ...filtros, fechaDesde: evento.target.value })} />
        </label>
        <label>Hasta
          <input type="date" value={filtros.fechaHasta} onChange={(evento) => setFiltros({ ...filtros, fechaHasta: evento.target.value })} />
        </label>
        <button type="submit" className="ts-btn ts-btn-primary">Filtrar</button>
      </form>

      <div className="ts-panel ts-panel--form">
        <div className="ts-panel-title">
          <h2 id="boletas-titulo">Boletas</h2>
        </div>

        {cargando ? (
          <p className="ts-feedback" role="status">Cargando boletas…</p>
        ) : error ? (
          <div className="ts-feedback ts-error" role="alert">
            <p>{error}</p>
            <button type="button" className="ts-btn" onClick={() => cargar()}>Reintentar</button>
          </div>
        ) : boletas.length === 0 ? (
          <p className="ts-empty">Todavía no hay boletas registradas.</p>
        ) : (
          <div className="ts-table-wrap">
            <table className="ts-table">
              <caption>Boletas de envío guardadas</caption>
              <thead>
                <tr>
                  <th scope="col">Número</th>
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
      </div>
      <Paginacion pagina={pagina} total={paginas} alCambiar={setPagina} etiqueta="Paginación de boletas" />
    </section>
  );
}
