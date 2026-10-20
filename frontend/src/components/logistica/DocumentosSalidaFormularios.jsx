import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../context/SesionContext.jsx";
import { tienePermiso } from "../../services/permisos.js";
import {
  consultarDisponibilidadLotes,
  crearBoleta,
  crearSolicitudSalida,
  listarSolicitudesSalida,
} from "../../services/boletasService.js";
import {
  cantidadAutorizadaPorSolicitud,
  cantidadSugerida,
  formatearEscalada,
  saldoDeLote,
  validarCantidadContraSolicitud,
  validarCantidadLote,
} from "../../services/saldosLotes.js";
import { obtenerOrdenes } from "../../services/ordenesService.js";
import { listarLotesOrden } from "../../services/lotesService.js";
import { formatearCantidad } from "../../utils/format.js";

export default function DocumentosSalidaFormularios() {
  const navigate = useNavigate();
  const { usuario } = useSesion();
  const puedeCrearSolicitud = tienePermiso(usuario, "logistica.solicitudes.gestionar");
  const puedeCrearBoleta = tienePermiso(usuario, "logistica.boletas.gestionar");
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

  // Cada lote de la orden con su disponibilidad real (viene del backend).
  const opcionesLote = lotes.map((lote) => {
    const saldo = saldoDeLote(saldosLotes, lote.codigo);
    return { ...lote, disponible: saldo ? saldo.cantidadDisponible : null };
  });

  // La solicitud elegida: de ella vienen los lotes y las cantidades precargadas.
  const solicitudActual = solicitudes.find((item) => String(item.id) === solicitudId);

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
    for (const item of itemsBoleta) {
      if (!item.referencia) return "Selecciona la referencia de cada ítem de la boleta.";
      const revision = validarCantidadContraSolicitud(item.cantidad, solicitudActual?.items, item.referencia);
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

  return (<>
      {(puedeCrearSolicitud || puedeCrearBoleta) && (
        <div className="ts-panel documentos-salida">
          <h2>Crear documentos de salida</h2>
          {errorFormulario && <p className="ts-feedback ts-error" role="alert">{errorFormulario}</p>}
          {mensajeFormulario && <p className="ts-feedback ts-notice" role="status">{mensajeFormulario}</p>}
          {puedeCrearSolicitud && (
            <form className="documentos-salida__seccion" onSubmit={guardarSolicitud} aria-label="Crear solicitud de salida">
              <h3>1. Nueva solicitud de salida</h3>
              <div className="documentos-salida__campos">
                <label className="ts-field">Orden *
                  <select required value={nuevaSolicitud.ordenId} onChange={(evento) => setNuevaSolicitud({ ...nuevaSolicitud, ordenId: evento.target.value, items: [{ referencia: "", cantidad: "", cantidadManual: false }] })}>
                    <option value="">Seleccionar orden</option>
                    {ordenes.map((orden) => <option key={orden.id} value={orden.id}>{orden.codigo}</option>)}
                  </select>
                </label>
                <label className="ts-field">Destino documental *
                  <input required maxLength={250} value={nuevaSolicitud.destinoDocumental} onChange={(evento) => setNuevaSolicitud({ ...nuevaSolicitud, destinoDocumental: evento.target.value })} />
                </label>
                <label className="ts-field">Motivo *
                  <input required maxLength={500} value={nuevaSolicitud.motivo} onChange={(evento) => setNuevaSolicitud({ ...nuevaSolicitud, motivo: evento.target.value })} />
                </label>
              </div>
              <div className="documentos-salida__items">
              <h4>Ítems de la solicitud</h4>
              {nuevaSolicitud.items.map((item, indice) => {
                const saldo = saldoDeReferencia(item.referencia);
                const disponible = saldo ? Number(saldo.cantidadDisponible) : null;
                return (
                <div className="documentos-salida__fila-item" key={indice}>
                  <label className="ts-field">Lote *
                    <select required value={item.referencia} onChange={(evento) => seleccionarLoteSolicitud(indice, evento.target.value)}>
                      <option value="">Seleccionar lote</option>
                      {opcionesLote.map((lote) => (
                        <option key={lote.id} value={lote.codigo}>
                          {lote.codigo}{lote.disponible !== null ? " · disponible " + formatearCantidad(lote.disponible) : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ts-field">Cantidad *
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
                  <button type="button" className="ts-btn" onClick={() => usarTodoLoDisponible(indice)} disabled={!saldo || disponible <= 0}>Usar todo lo disponible</button>
                  {nuevaSolicitud.items.length > 1 && <button type="button" className="ts-btn" onClick={() => setNuevaSolicitud((actual) => ({ ...actual, items: actual.items.filter((_, posicion) => posicion !== indice) }))}>Quitar ítem</button>}
                </div>
              );})}
              </div>
              <div className="ts-btn-group documentos-salida__acciones">
                <button type="button" className="ts-btn" onClick={() => setNuevaSolicitud((actual) => ({ ...actual, items: [...actual.items, { referencia: "", cantidad: "", cantidadManual: false }] }))}>Agregar ítem</button>
                <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando || lotes.length === 0}>Crear solicitud</button>
              </div>
              {nuevaSolicitud.ordenId && lotes.length === 0 && <p className="ts-notice">La orden seleccionada todavía no tiene lotes registrados.</p>}
            </form>
          )}
          {puedeCrearBoleta && (
            <form className="documentos-salida__seccion" onSubmit={guardarBoleta} aria-label="Crear boleta de salida">
              <h3>2. Crear boleta en BORRADOR</h3>
              <div className="documentos-salida__seleccion">
              <label className="ts-field">Solicitud de salida *
                <select required value={solicitudId} onChange={(evento) => seleccionarSolicitud(evento.target.value)}>
                  <option value="">Seleccionar solicitud</option>
                  {solicitudes.map((solicitud) => <option key={solicitud.id} value={solicitud.id}>#{solicitud.id} · orden #{solicitud.ordenId} · {solicitud.destinoDocumental}</option>)}
                </select>
              </label>
              <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando || !solicitudId || itemsBoleta.length === 0}>Crear boleta</button>
              </div>
              <div className="documentos-salida__items">
              {itemsBoleta.map((item, indice) => (
                <div className="documentos-salida__fila-item" key={indice}>
                  <label className="ts-field">Referencia *
                    <select required value={item.referencia} onChange={(evento) => seleccionarReferenciaBoleta(indice, evento.target.value)}>
                      <option value="">Seleccionar referencia</option>
                      {(solicitudActual?.items ?? []).map((solicitudItem) => <option key={solicitudItem.id} value={solicitudItem.referencia}>{solicitudItem.referencia}</option>)}
                    </select>
                  </label>
                  <label className="ts-field">Cantidad *
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
              </div>
              {solicitudId && <div className="ts-btn-group documentos-salida__acciones">
                <button type="button" className="ts-btn" onClick={() => setItemsBoleta((actual) => [...actual, { referencia: "", cantidad: "" }])}>Agregar ítem</button>
              </div>}
            </form>
          )}
        </div>
      )}

  </>);
}
