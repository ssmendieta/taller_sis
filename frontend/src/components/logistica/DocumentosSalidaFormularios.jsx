import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../context/SesionContext.jsx";
import { tienePermiso } from "../../services/permisos.js";
import { crearBoleta, crearSolicitudSalida, listarSolicitudesSalida } from "../../services/boletasService.js";
import { obtenerOrdenes } from "../../services/ordenesService.js";
import { listarLotesOrden } from "../../services/lotesService.js";

export default function DocumentosSalidaFormularios() {
  const navigate = useNavigate();
  const { usuario } = useSesion();
  const puedeCrearSolicitud = tienePermiso(usuario, "logistica.solicitudes.gestionar");
  const puedeCrearBoleta = tienePermiso(usuario, "logistica.boletas.gestionar");
  const [ordenes, setOrdenes] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [nuevaSolicitud, setNuevaSolicitud] = useState({ ordenId: "", destinoDocumental: "", motivo: "", items: [{ referencia: "", cantidad: "" }] });
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
    if (!orden) { setLotes([]); return; }
    let vigente = true;
    listarLotesOrden(orden.codigo)
      .then((datos) => { if (vigente) setLotes(Array.isArray(datos) ? datos : []); })
      .catch((fallo) => { if (vigente) { setLotes([]); setErrorFormulario(fallo.message); } });
    return () => { vigente = false; };
  }, [nuevaSolicitud.ordenId, ordenes]);

  function cambiarItemSolicitud(indice, campo, valor) {
    setNuevaSolicitud((actual) => ({
      ...actual,
      items: actual.items.map((item, posicion) => posicion === indice ? { ...item, [campo]: valor } : item),
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
                  <select required value={nuevaSolicitud.ordenId} onChange={(evento) => setNuevaSolicitud({ ...nuevaSolicitud, ordenId: evento.target.value, items: [{ referencia: "", cantidad: "" }] })}>
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
              {nuevaSolicitud.items.map((item, indice) => (
                <div className="documentos-salida__fila-item" key={indice}>
                  <label className="ts-field">Lote *
                    <select required value={item.referencia} onChange={(evento) => cambiarItemSolicitud(indice, "referencia", evento.target.value)}>
                      <option value="">Seleccionar lote</option>
                      {lotes.map((lote) => <option key={lote.id} value={lote.codigo}>{lote.codigo}</option>)}
                    </select>
                  </label>
                  <label className="ts-field">Cantidad *
                    <input required type="number" min="0.0001" max="9999999999.9999" step="0.0001" value={item.cantidad} onChange={(evento) => cambiarItemSolicitud(indice, "cantidad", evento.target.value)} />
                  </label>
                  {nuevaSolicitud.items.length > 1 && <button type="button" className="ts-btn" onClick={() => setNuevaSolicitud((actual) => ({ ...actual, items: actual.items.filter((_, posicion) => posicion !== indice) }))}>Quitar ítem</button>}
                </div>
              ))}
              </div>
              <div className="ts-btn-group documentos-salida__acciones">
                <button type="button" className="ts-btn" onClick={() => setNuevaSolicitud((actual) => ({ ...actual, items: [...actual.items, { referencia: "", cantidad: "" }] }))}>Agregar ítem</button>
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
                    <select required value={item.referencia} onChange={(evento) => setItemsBoleta((actual) => actual.map((valor, posicion) => posicion === indice ? { ...valor, referencia: evento.target.value } : valor))}>
                      <option value="">Seleccionar referencia</option>
                      {(solicitudes.find((solicitud) => String(solicitud.id) === solicitudId)?.items ?? []).map((solicitudItem) => <option key={solicitudItem.id} value={solicitudItem.referencia}>{solicitudItem.referencia}</option>)}
                    </select>
                  </label>
                  <label className="ts-field">Cantidad *
                    <input required type="number" min="0.0001" max="9999999999.9999" step="0.0001" value={item.cantidad} onChange={(evento) => setItemsBoleta((actual) => actual.map((valor, posicion) => posicion === indice ? { ...valor, cantidad: evento.target.value } : valor))} />
                  </label>
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
