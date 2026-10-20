import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import {
  ESTADO_BOLETA_EMITIDA,
  actualizarBoletaItems,
  anularBoleta,
  emitirBoleta,
  obtenerBoleta,
  obtenerSolicitudSalida,
} from "../services/boletasService.js";
import { obtenerOrden } from "../services/ordenesService.js";
import { formatearFechaHora, formatearNumero } from "../utils/format.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import { FORMATO_TITULO } from "../constants/marca.js";
import "../styles/boleta-print.css";

const ETIQUETAS_ESTADO = {
  BORRADOR: "Borrador",
  EMITIDA: "Emitida",
  ANULADA: "Anulada",
};

// La API solo devuelve el id del responsable; si es quien consulta se muestra su nombre.
function responsableDe(boleta, usuario) {
  const id = boleta.responsableUsuarioId;
  if (id == null) return "—";
  if (usuario?.id != null && String(usuario.id) === String(id)) {
    return usuario.nombre_completo ?? usuario.nombre ?? `Usuario ${id}`;
  }
  return `Usuario ${id}`;
}

function fechaHoraTexto(valor) {
  if (!valor) return "—";
  const { fecha, hora } = formatearFechaHora(valor);
  return `${fecha} ${hora}`;
}

function mensajeError(fallo) {
  if (fallo?.status === 404) return "La boleta no existe.";
  if (fallo?.status === 403) return "No tienes permiso para consultar boletas.";
  if (fallo?.status === 401) return "Tu sesión expiró. Vuelve a ingresar.";
  return fallo?.message || "No se pudo cargar la boleta.";
}

export default function BoletaDetallePage() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const [boleta, setBoleta] = useState(null);
  const [solicitud, setSolicitud] = useState(null);
  const [ordenCodigo, setOrdenCodigo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [emitiendo, setEmitiendo] = useState(false);
  const [mensajeEmision, setMensajeEmision] = useState("");
  const [errorEmision, setErrorEmision] = useState("");
  const [mostrarAnulacion, setMostrarAnulacion] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [mensajeAnulacion, setMensajeAnulacion] = useState("");
  const [errorAnulacion, setErrorAnulacion] = useState("");
  const [editandoItems, setEditandoItems] = useState(false);
  const [itemsEdicion, setItemsEdicion] = useState([]);
  const [guardandoItems, setGuardandoItems] = useState(false);
  const [errorItems, setErrorItems] = useState("");
  const [mensajeItems, setMensajeItems] = useState("");

  const puedeEmitir = tienePermiso(usuario, "logistica.boletas.gestionar");

  async function handleGuardarItems(evento) {
    evento.preventDefault();
    setErrorItems("");
    if (itemsEdicion.length === 0) {
      setErrorItems("La boleta debe conservar al menos un ítem.");
      return;
    }
    setGuardandoItems(true);
    try {
      await actualizarBoletaItems(id, itemsEdicion.map((item) => ({ referencia: item.referencia, cantidad: String(item.cantidad) })));
      setEditandoItems(false);
      setMensajeItems("Ítems del borrador actualizados.");
      await cargar();
    } catch (fallo) {
      if (fallo?.status === 409) setErrorItems("La boleta ya no está en BORRADOR. Actualiza el detalle.");
      else if (fallo?.status === 403) setErrorItems("No tienes permiso para editar boletas.");
      else setErrorItems(fallo?.message || "No se pudieron guardar los ítems.");
    } finally {
      setGuardandoItems(false);
    }
  }

  async function handleAnular(evento) {
    evento.preventDefault();
    setErrorAnulacion("");
    if (!motivoAnulacion.trim()) {
      setErrorAnulacion("El motivo de anulación es obligatorio.");
      return;
    }
    setAnulando(true);
    try {
      await anularBoleta(id, motivoAnulacion.trim());
      setMostrarAnulacion(false);
      setMotivoAnulacion("");
      setMensajeAnulacion("Boleta anulada correctamente.");
      await cargar();
    } catch (fallo) {
      if (fallo?.status === 400) setErrorAnulacion("El motivo de anulación es obligatorio y debe ser válido.");
      else if (fallo?.status === 403) setErrorAnulacion("No tienes permiso para anular boletas.");
      else if (fallo?.status === 409) setErrorAnulacion("La boleta ya no está EMITIDA. Actualiza el detalle.");
      else setErrorAnulacion(fallo?.message || "No se pudo anular la boleta.");
    } finally {
      setAnulando(false);
    }
  }

  async function handleEmitir() {
    if (emitiendo) return;
    setMensajeEmision("");
    setErrorEmision("");

    if (boleta?.estado !== "BORRADOR") {
      setErrorEmision("Solo una boleta en BORRADOR puede ser emitida.");
      return;
    }

    const confirmar = window.confirm(
      "¿Está seguro de emitir esta boleta? Una vez emitida, la cabecera no podrá modificarse."
    );

    if (!confirmar) {
      return;
    }

    setEmitiendo(true);
    try {
      await emitirBoleta(id);
      setMensajeEmision("Boleta emitida correctamente.");
      await cargar();
    } catch (fallo) {
      setErrorEmision(fallo?.message || "No se pudo emitir la boleta.");
    } finally {
      setEmitiendo(false);
    }
  }

  async function cargar() {
    setCargando(true);
    setError("");

    try {
      const datos = await obtenerBoleta(id);
      const salida = await obtenerSolicitudSalida(datos.solicitudSalidaId);
      setBoleta(datos);
      setSolicitud(salida);
      setItemsEdicion((datos.items ?? []).map((item) => ({ referencia: item.referencia, cantidad: item.cantidad })));

      // El código de la orden es opcional: requiere permiso de consulta en Producción.
      try {
        const orden = await obtenerOrden(salida.ordenId);
        setOrdenCodigo(orden?.codigo ?? null);
      } catch {
        setOrdenCodigo(null);
      }
    } catch (fallo) {
      setBoleta(null);
      setSolicitud(null);
      setError(mensajeError(fallo));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setMensajeEmision("");
    setErrorEmision("");
    setMensajeAnulacion("");
    setErrorAnulacion("");
    setMostrarAnulacion(false);
    setEditandoItems(false);
    setErrorItems("");
    setMensajeItems("");
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    document.title = FORMATO_TITULO(boleta?.numero ? `Boleta ${boleta.numero}` : "Boleta");
  }, [boleta?.numero]);

  if (cargando) {
    return <p className="ts-feedback" role="status">Cargando boleta…</p>;
  }

  if (error) {
    return (
      <div className="ts-feedback ts-error" role="alert">
        <p>{error}</p>
        <div className="ts-btn-group">
          <button type="button" className="ts-btn" onClick={cargar}>Reintentar</button>
          <Link className="ts-btn" to="/logistica/boletas">Volver</Link>
        </div>
      </div>
    );
  }

  if (!boleta || !solicitud) return null;

  const emitida = boleta.estado === ESTADO_BOLETA_EMITIDA;
  const items = Array.isArray(boleta.items) ? boleta.items : [];
  const historial = Array.isArray(boleta.historial) ? [...boleta.historial].sort(
    (a, b) => new Date(a.fechaHora) - new Date(b.fechaHora)
  ) : [];
  const orden = ordenCodigo ?? `Orden #${solicitud.ordenId}`;
  const datos = [
    ["Número", boleta.numero],
    ["Orden", orden],
    ["Destino", solicitud.destinoDocumental],
    ["Fecha", fechaHoraTexto(boleta.creadoEn)],
    ["Responsable", responsableDe(boleta, usuario)],
    ["Solicitud de salida", `#${boleta.solicitudSalidaId}`],
  ];

  return (
    <section className="ts-page" aria-labelledby="boleta-titulo">
      <div className="boleta-pantalla">
        <PageHeader
          titulo={`Boleta ${boleta.numero}`}
          descripcion={`Estado: ${ETIQUETAS_ESTADO[boleta.estado] ?? boleta.estado}`}
          accion={
            <div className="ts-btn-group">
              {puedeEmitir && !emitida && boleta.estado === "BORRADOR" && (
                <button
                  type="button"
                  className="ts-btn ts-btn-primary"
                  onClick={handleEmitir}
                  disabled={emitiendo}
                  data-feature="ABC-234"
                >
                  {emitiendo ? "Emitiendo…" : "Emitir boleta"}
                </button>
              )}
              {puedeEmitir && boleta.estado === "BORRADOR" && (
                <button type="button" className="ts-btn" onClick={() => setEditandoItems(true)}>Editar ítems</button>
              )}
              {emitida && (
                <button type="button" className="ts-btn ts-btn-primary" onClick={() => window.print()}>
                  Imprimir
                </button>
              )}
              {puedeEmitir && emitida && (
                <button type="button" className="ts-btn ts-btn-danger" onClick={() => setMostrarAnulacion(true)}>
                  Anular boleta
                </button>
              )}
              <Link className="ts-btn" to="/logistica/boletas">Volver</Link>
            </div>
          }
        />

        {mensajeEmision && (
          <div className="ts-feedback ts-notice" role="status" style={{ marginBottom: "1rem" }}>
            <p>{mensajeEmision}</p>
          </div>
        )}

        {errorEmision && (
          <div className="ts-feedback ts-error" role="alert" style={{ marginBottom: "1rem" }}>
            <p>{errorEmision}</p>
          </div>
        )}

        {mensajeAnulacion && <p className="ts-feedback ts-notice" role="status">{mensajeAnulacion}</p>}
        {mensajeItems && <p className="ts-feedback ts-notice" role="status">{mensajeItems}</p>}

        {editandoItems && boleta.estado === "BORRADOR" && (
          <form className="ts-panel" onSubmit={handleGuardarItems}>
            <h2>Ítems del borrador</h2>
            <p>Las referencias deben pertenecer a la solicitud de salida y a los lotes de la orden.</p>
            {itemsEdicion.map((item, indice) => (
              <div className="ts-filters" key={indice}>
                <label>Referencia *
                  <select required value={item.referencia} onChange={(evento) => setItemsEdicion((actual) => actual.map((valor, posicion) => posicion === indice ? { ...valor, referencia: evento.target.value } : valor))}>
                    <option value="">Seleccionar referencia</option>
                    {(solicitud.items ?? []).map((solicitudItem) => <option key={solicitudItem.id} value={solicitudItem.referencia}>{solicitudItem.referencia}</option>)}
                  </select>
                </label>
                <label>Cantidad *
                  <input required type="number" min="0.0001" max="9999999999.9999" step="0.0001" value={item.cantidad} onChange={(evento) => setItemsEdicion((actual) => actual.map((valor, posicion) => posicion === indice ? { ...valor, cantidad: evento.target.value } : valor))} />
                </label>
                {itemsEdicion.length > 1 && <button type="button" className="ts-btn" onClick={() => setItemsEdicion((actual) => actual.filter((_, posicion) => posicion !== indice))}>Quitar ítem</button>}
              </div>
            ))}
            {errorItems && <p className="ts-feedback ts-error" role="alert">{errorItems}</p>}
            <div className="ts-btn-group">
              <button type="button" className="ts-btn" onClick={() => setItemsEdicion((actual) => [...actual, { referencia: "", cantidad: "" }])}>Agregar ítem</button>
              <button type="button" className="ts-btn" onClick={() => { setEditandoItems(false); setErrorItems(""); setItemsEdicion(items.map((item) => ({ referencia: item.referencia, cantidad: item.cantidad }))); }}>Cancelar</button>
              <button type="submit" className="ts-btn ts-btn-primary" disabled={guardandoItems || itemsEdicion.length === 0}>{guardandoItems ? "Guardando…" : "Guardar ítems"}</button>
            </div>
          </form>
        )}

        {mostrarAnulacion && (
          <div className="ts-modal-overlay">
            <form className="ts-modal" role="dialog" aria-modal="true" aria-labelledby="anular-titulo" onSubmit={handleAnular}>
              <h2 id="anular-titulo">Anular boleta {boleta.numero}</h2>
              <p>La boleta conservará su número e ítems, pero dejará de contar para el saldo documental.</p>
              <label htmlFor="motivo-anulacion">Motivo de anulación *</label>
              <textarea id="motivo-anulacion" value={motivoAnulacion} onChange={(evento) => setMotivoAnulacion(evento.target.value)} maxLength={500} required rows={3} />
              {errorAnulacion && <p className="ts-error" role="alert">{errorAnulacion}</p>}
              <div className="ts-modal-actions">
                <button type="button" className="ts-btn" disabled={anulando} onClick={() => { setMostrarAnulacion(false); setErrorAnulacion(""); }}>Cancelar</button>
                <button type="submit" className="ts-btn ts-btn-danger" disabled={anulando}>{anulando ? "Anulando…" : "Confirmar anulación"}</button>
              </div>
            </form>
          </div>
        )}

        {!emitida && (
          <p className="ts-notice" role="note">
            Solo una boleta EMITIDA tiene formato de envío. Esta boleta está en estado{" "}
            {ETIQUETAS_ESTADO[boleta.estado]?.toLowerCase() ?? boleta.estado} y no se puede imprimir.
          </p>
        )}
      </div>

      {/* Vista previa: muestra exactamente los datos e ítems guardados. */}
      <article className={`boleta-documento${emitida ? "" : " boleta-documento--no-emitida"}`}>
        <header className="boleta-documento__cabecera">
          <div>
            <p className="boleta-documento__tipo">Boleta de envío</p>
            <h2 id="boleta-titulo">N.º {boleta.numero}</h2>
          </div>
          <span className="boleta-documento__estado">
            {ETIQUETAS_ESTADO[boleta.estado] ?? boleta.estado}
          </span>
        </header>

        <dl className="boleta-documento__datos">
          {datos.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt>{etiqueta}</dt>
              <dd>{valor || "—"}</dd>
            </div>
          ))}
        </dl>

        <table className="boleta-documento__items">
          <caption>Ítems de la boleta</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Referencia</th>
              <th scope="col" className="boleta-documento__num">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, indice) => (
              <tr key={item.id ?? indice}>
                <td>{indice + 1}</td>
                <td>{item.referencia}</td>
                <td className="boleta-documento__num">{formatearNumero(item.cantidad)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3}>La boleta no tiene ítems.</td>
              </tr>
            )}
          </tbody>
        </table>

        <footer className="boleta-documento__pie">
          Documento de salida de Logística. No reemplaza firma digital, comprobante
          del sistema de Despachos ni factura o PDF fiscal.
        </footer>
      </article>

      {historial.length > 0 && (
        <div className="ts-panel boleta-pantalla">
          <h2>Historial de la boleta</h2>
          {historial.map((evento) => (
            <p key={evento.id}>
              {fechaHoraTexto(evento.fechaHora)} — {evento.estadoAnterior} → {evento.estadoNuevo}: {evento.motivo}
            </p>
          ))}
        </div>
      )}

      {!emitida && (
        <p className="boleta-no-imprimible">
          Boleta {boleta.numero} en estado {boleta.estado}: solo una boleta EMITIDA
          tiene formato de envío.
        </p>
      )}
    </section>
  );
}
