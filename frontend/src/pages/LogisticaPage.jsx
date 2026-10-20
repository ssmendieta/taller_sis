import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import {
  crearSolicitudSalida, listarSolicitudesSalida,
  PERMISO_CONSULTAR_SOLICITUDES, PERMISO_GESTIONAR_SOLICITUDES,
} from "../services/boletasService.js";
import { obtenerOrdenes } from "../services/ordenesService.js";
import { listarLotesOrden } from "../services/lotesService.js";
import { datosSolicitudSalida, mensajeErrorSalida } from "../services/solicitudesSalidaFormulario.js";
import { FORMATO_TITULO } from "../constants/marca.js";

export default function LogisticaPage() {
  const { usuario } = useSesion();
  const puedeConsultar = tienePermiso(usuario, PERMISO_CONSULTAR_SOLICITUDES);
  const puedeCrear = tienePermiso(usuario, PERMISO_GESTIONAR_SOLICITUDES);
  const puedeOrdenes = tienePermiso(usuario, "ordenes.consultar");
  const puedeBoleta = tienePermiso(usuario, "logistica.boletas.gestionar");
  const [solicitudes, setSolicitudes] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [ordenId, setOrdenId] = useState("");
  const [lotes, setLotes] = useState([]);
  const [items, setItems] = useState([]);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cargandoOrdenes, setCargandoOrdenes] = useState(false);
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorListado, setErrorListado] = useState("");
  const [errorOrdenes, setErrorOrdenes] = useState("");
  const [errorLotes, setErrorLotes] = useState("");
  const [error, setError] = useState("");
  const [confirmada, setConfirmada] = useState(null);
  const orden = ordenes.find((fila) => String(fila.id) === ordenId);

  async function refrescarSolicitudes() {
    if (!puedeConsultar) return;
    setCargando(true);
    setErrorListado("");
    try {
      const respuesta = await listarSolicitudesSalida();
      if (!Array.isArray(respuesta)) throw new Error("El servidor no devolvió un listado válido de solicitudes.");
      setSolicitudes(respuesta);
    } catch (fallo) {
      setErrorListado(mensajeErrorSalida(fallo, PERMISO_CONSULTAR_SOLICITUDES));
    } finally { setCargando(false); }
  }

  useEffect(() => {
    document.title = FORMATO_TITULO("Solicitudes de salida");
    refrescarSolicitudes();
  }, [puedeConsultar]);

  useEffect(() => {
    let vigente = true;
    if (!puedeCrear || !puedeOrdenes) return;
    setCargandoOrdenes(true);
    setErrorOrdenes("");
    obtenerOrdenes().then((respuesta) => {
      if (vigente) setOrdenes(respuesta.filter((fila) => fila?.id && fila.codigo));
    }).catch((fallo) => {
      if (vigente) setErrorOrdenes(mensajeErrorSalida(fallo, "ordenes.consultar"));
    }).finally(() => { if (vigente) setCargandoOrdenes(false); });
    return () => { vigente = false; };
  }, [puedeCrear, puedeOrdenes]);

  useEffect(() => {
    let vigente = true;
    if (!orden || !puedeOrdenes) return;
    setCargandoLotes(true);
    listarLotesOrden(orden.codigo).then((respuesta) => {
      if (!Array.isArray(respuesta)) throw new Error("El servidor no devolvió un listado válido de lotes.");
      if (vigente) setLotes(respuesta.filter((lote) => String(lote.ordenId) === String(orden.id) && lote.codigo));
    }).catch((fallo) => {
      if (vigente) setErrorLotes(mensajeErrorSalida(fallo, "ordenes.consultar"));
    }).finally(() => { if (vigente) setCargandoLotes(false); });
    return () => { vigente = false; };
  }, [orden, puedeOrdenes]);

  function seleccionarOrden(id) {
    setOrdenId(id);
    setLotes([]);
    setItems(id ? [{ referencia: "", cantidad: "" }] : []);
    setErrorLotes("");
    setError("");
    setCargandoLotes(Boolean(id));
  }

  function cambiarItem(indice, campo, valor) {
    setItems((actuales) => actuales.map((item, i) => i === indice ? { ...item, [campo]: valor } : item));
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (guardando || cargandoLotes) return;
    setError("");
    setConfirmada(null);
    if (!puedeCrear || !puedeOrdenes) return setError("Se requieren logistica.solicitudes.gestionar y ordenes.consultar.");
    let datos;
    try { datos = datosSolicitudSalida({ orden, lotes, items, destinoDocumental: destino, motivo }); }
    catch (fallo) { return setError(fallo.message); }
    setGuardando(true);
    try {
      const creada = await crearSolicitudSalida(datos);
      setConfirmada(creada);
      seleccionarOrden("");
      setDestino("");
      setMotivo("");
      await refrescarSolicitudes();
    } catch (fallo) {
      setError(mensajeErrorSalida(fallo, PERMISO_GESTIONAR_SOLICITUDES));
    } finally { setGuardando(false); }
  }

  return (
    <section className="ts-page" aria-label="Solicitudes de salida">
      <PageHeader titulo="Solicitudes de salida" descripcion="Consulta solicitudes guardadas y registra una salida con los lotes de una orden."
        accion={<Link className="ts-btn" to="/logistica/boletas">Boletas</Link>} />
      {confirmada && <div className="ts-success" role="status">
        Solicitud #{confirmada.id} registrada en el servidor. Estado: {confirmada.estado}.
        {puedeBoleta && puedeConsultar && puedeOrdenes && <> <Link to="/logistica/boletas/nueva">Crear boleta</Link></>}
      </div>}
      {error && <p className="ts-feedback ts-error" role="alert">{error}</p>}
      {!puedeCrear && <p>Para registrar una solicitud necesitas el permiso {PERMISO_GESTIONAR_SOLICITUDES}.</p>}
      {puedeCrear && !puedeOrdenes && <p role="alert">Necesitas el permiso ordenes.consultar para seleccionar órdenes y lotes reales.</p>}
      {puedeCrear && puedeOrdenes && <form className="ts-panel" onSubmit={guardar}>
        <div className="ts-panel-title"><h2 id="logistica-title">Nueva solicitud de salida</h2></div>
        <fieldset disabled={guardando} style={{ border: 0, margin: 0, padding: "1rem" }}>
          {errorOrdenes && <p role="alert">{errorOrdenes}</p>}
          <div className="ts-filters">
            <label htmlFor="salida-orden">Orden de producción
              <select id="salida-orden" value={ordenId} onChange={(e) => seleccionarOrden(e.target.value)} disabled={cargandoOrdenes} required>
                <option value="">{cargandoOrdenes ? "Cargando órdenes…" : "Selecciona una orden"}</option>
                {ordenes.map((fila) => <option key={fila.id} value={String(fila.id)}>{fila.codigo} · {fila.estado}</option>)}
              </select>
            </label>
            <label htmlFor="salida-destino">Destino documental
              <input id="salida-destino" value={destino} onChange={(e) => setDestino(e.target.value)} maxLength={250} required />
            </label>
          </div>
          <label htmlFor="salida-motivo">Motivo
            <textarea id="salida-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} required />
          </label>
          {!cargandoOrdenes && !errorOrdenes && ordenes.length === 0 && <p>No hay órdenes disponibles para seleccionar.</p>}
          {errorLotes && <p role="alert">{errorLotes}</p>}
          {cargandoLotes && <p role="status">Consultando lotes de la orden…</p>}
          {orden && !cargandoLotes && !errorLotes && !lotes.length && <p>La orden no tiene lotes registrados. No se puede crear una solicitud sin una referencia real.</p>}
          {items.map((item, indice) => <div className="ts-filters" key={indice}>
            <label htmlFor={`salida-lote-${indice}`}>Referencia de lote {indice + 1}
              <select id={`salida-lote-${indice}`} value={item.referencia} onChange={(e) => cambiarItem(indice, "referencia", e.target.value)} disabled={cargandoLotes || !lotes.length} required>
                <option value="">Selecciona un lote</option>
                {lotes.map((lote) => <option key={lote.id} value={lote.codigo}>{lote.codigo} · {lote.cantidad} unidades asignadas</option>)}
              </select>
            </label>
            <label htmlFor={`salida-cantidad-${indice}`}>Cantidad {indice + 1}
              <input id={`salida-cantidad-${indice}`} type="number" min="0.0001" step="0.0001" max="9999999999.9999"
                value={item.cantidad} onChange={(e) => cambiarItem(indice, "cantidad", e.target.value)} required />
            </label>
            <button type="button" className="ts-btn" onClick={() => setItems((actuales) => actuales.filter((_, i) => i !== indice))}>Quitar ítem {indice + 1}</button>
          </div>)}
          <div className="ts-btn-group">
            <button type="button" className="ts-btn" disabled={!lotes.length || cargandoLotes}
              onClick={() => setItems((actuales) => [...actuales, { referencia: "", cantidad: "" }])}>Agregar ítem</button>
            <button type="submit" className="ts-btn ts-btn-primary" disabled={guardando || cargandoOrdenes || cargandoLotes || !lotes.length || !items.length}>
              {guardando ? "Guardando…" : "Guardar solicitud"}
            </button>
          </div>
        </fieldset>
      </form>}
      <div className="ts-panel">
        <div className="ts-panel-title"><h2>Solicitudes guardadas</h2>
          {puedeConsultar && <button type="button" className="ts-btn" onClick={refrescarSolicitudes} disabled={cargando}>Actualizar solicitudes</button>}
        </div>
        {!puedeConsultar ? <p>Necesitas el permiso {PERMISO_CONSULTAR_SOLICITUDES} para consultar las solicitudes y seleccionarlas al crear una boleta.</p>
          : errorListado ? <p role="alert">{errorListado}</p>
          : cargando ? <p role="status">Cargando solicitudes…</p>
          : !solicitudes.length ? <p>No hay solicitudes de salida guardadas.</p>
          : <div className="ts-table-wrap"><table className="ts-table">
            <caption>Solicitudes de salida persistidas</caption>
            <thead><tr><th>ID</th><th>Orden</th><th>Destino</th><th>Motivo</th><th>Estado</th><th>Ítems</th></tr></thead>
            <tbody>{solicitudes.map((fila) => <tr key={fila.id}>
              <td>#{fila.id}</td><td>#{fila.ordenId}</td><td>{fila.destinoDocumental}</td><td>{fila.motivo}</td><td>{fila.estado}</td>
              <td>{(fila.items ?? []).map((item) => `${item.referencia}: ${item.cantidad}`).join("; ")}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </section>
  );
}
