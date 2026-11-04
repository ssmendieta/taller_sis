import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import {
  ESTADO_BOLETA_EMITIDA,
  actualizarItemsBoleta,
  anularBoleta,
  emitirBoleta,
  obtenerBoleta,
  obtenerSolicitudSalida,
} from "../services/boletasService.js";
import { obtenerOrden } from "../services/ordenesService.js";
import { listarLotesOrden } from "../services/lotesService.js";
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
  const [editandoItems, setEditandoItems] = useState(false);
  const [itemsBorrador, setItemsBorrador] = useState([]);
  const [lotesDisponibles, setLotesDisponibles] = useState([]);
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [guardandoItems, setGuardandoItems] = useState(false);
  const [mensajeItems, setMensajeItems] = useState("");
  const [errorItems, setErrorItems] = useState("");
  const [nuevoLote, setNuevoLote] = useState("");
  const [cantidadNuevoLote, setCantidadNuevoLote] = useState("1");
  const [mostrandoAnulacion, setMostrandoAnulacion] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [anulacionConfirmada, setAnulacionConfirmada] = useState(false);
  const [mensajeAnulacion, setMensajeAnulacion] = useState("");
  const [errorAnulacion, setErrorAnulacion] = useState("");

  const puedeEmitir = tienePermiso(usuario, "logistica.boletas.gestionar");

  async function recargarBoletaAnulada() {
    const actualizada = await obtenerBoleta(id);
    setBoleta(actualizada);
    setErrorAnulacion("");
  }

  async function handleAnular(evento) {
    evento.preventDefault();
    if (anulando || anulacionConfirmada || !puedeEmitir || boleta?.estado !== ESTADO_BOLETA_EMITIDA) return;
    const motivo = motivoAnulacion.trim();
    setErrorAnulacion("");
    if (!motivo) {
      setErrorAnulacion("El motivo de anulación es obligatorio y no puede estar vacío.");
      return;
    }
    if (motivo.length > 500) {
      setErrorAnulacion("El motivo no puede exceder los 500 caracteres.");
      return;
    }
    if (!window.confirm(`¿Confirmas anular la boleta ${boleta.numero}?\nMotivo: ${motivo}`)) return;

    setAnulando(true);
    let confirmada = false;
    try {
      await anularBoleta(id, motivo);
      confirmada = true;
      setAnulacionConfirmada(true);
      setMostrandoAnulacion(false);
      setMotivoAnulacion("");
      setMensajeAnulacion("Boleta anulada correctamente en el servidor.");
      await recargarBoletaAnulada();
    } catch (fallo) {
      setErrorAnulacion(confirmada
        ? `La anulación fue confirmada, pero no se pudo actualizar el detalle: ${fallo?.message || "Error de consulta"}. Recarga el detalle.`
        : fallo?.message || "No se pudo anular la boleta.");
    } finally {
      setAnulando(false);
    }
  }

  async function abrirEdicionItems() {
    if (!puedeEmitir || boleta?.estado !== "BORRADOR" || cargandoLotes) return;
    setErrorItems("");
    setMensajeItems("");
    setCargandoLotes(true);
    try {
      if (!ordenCodigo) {
        throw new Error("No se pudo verificar la orden. Comprueba tu permiso para consultar órdenes e inténtalo otra vez.");
      }
      const [lotes, solicitudActual] = await Promise.all([
        listarLotesOrden(ordenCodigo),
        obtenerSolicitudSalida(boleta.solicitudSalidaId),
      ]);
      const referenciasSolicitadas = new Set(
        (Array.isArray(solicitudActual?.items) ? solicitudActual.items : [])
          .map((item) => String(item.referencia ?? "").trim())
          .filter(Boolean),
      );
      const referenciasValidas = [...new Set(
        (Array.isArray(lotes) ? lotes : [])
          .filter((lote) => referenciasSolicitadas.has(String(lote.codigo ?? "").trim()))
          .map((lote) => String(lote.codigo).trim())
          .filter(Boolean),
      )];
      const referenciasActuales = (Array.isArray(boleta.items) ? boleta.items : [])
        .map((item) => String(item.referencia ?? "").trim())
        .filter(Boolean);
      if (referenciasValidas.length === 0 && referenciasActuales.length === 0) {
        throw new Error("No hay lotes válidos de esta orden incluidos en la solicitud de salida.");
      }
      // Conserva los ítems actuales aunque su lote ya no aparezca en la consulta externa.
      setLotesDisponibles([...new Set([...referenciasValidas, ...referenciasActuales])]);
      setItemsBorrador((Array.isArray(boleta.items) ? boleta.items : []).map((item) => ({
        referencia: String(item.referencia ?? ""),
        cantidad: String(item.cantidad ?? ""),
      })));
      setNuevoLote(referenciasValidas.find((referencia) => !referenciasActuales.includes(referencia)) ?? "");
      setCantidadNuevoLote("1");
      setEditandoItems(true);
    } catch (fallo) {
      setErrorItems(fallo?.message || "No se pudieron cargar los lotes válidos para editar.");
    } finally {
      setCargandoLotes(false);
    }
  }

  function cambiarItem(indice, campo, valor) {
    setItemsBorrador((actuales) => actuales.map((item, i) => (
      i === indice ? { ...item, [campo]: valor } : item
    )));
  }

  function agregarItem() {
    setErrorItems("");
    if (!nuevoLote) {
      setErrorItems("Selecciona un lote válido de la orden.");
      return;
    }
    if (itemsBorrador.some((item) => item.referencia === nuevoLote)) {
      setErrorItems("Ese lote ya está en la boleta. Edita su cantidad en la fila existente.");
      return;
    }
    setItemsBorrador((actuales) => [...actuales, { referencia: nuevoLote, cantidad: cantidadNuevoLote }]);
    setNuevoLote(lotesDisponibles.find((lote) => lote !== nuevoLote && !itemsBorrador.some((item) => item.referencia === lote)) ?? "");
    setCantidadNuevoLote("1");
  }

  async function guardarItems() {
    setErrorItems("");
    setMensajeItems("");
    if (itemsBorrador.length === 0) {
      setErrorItems("La boleta debe conservar al menos un ítem.");
      return;
    }
    const itemsNormalizados = [];
    for (const item of itemsBorrador) {
      const referencia = String(item.referencia ?? "").trim();
      const cantidad = String(item.cantidad ?? "").trim();
      if (!referencia) {
        setErrorItems("Cada ítem necesita una referencia de lote.");
        return;
      }
      if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(cantidad) || Number(cantidad) <= 0) {
        setErrorItems("La cantidad debe ser positiva y admitir hasta cuatro decimales.");
        return;
      }
      const [entero, decimales = ""] = cantidad.split(".");
      itemsNormalizados.push({ referencia, cantidad: `${entero}.${decimales.padEnd(4, "0")}` });
    }
    if (new Set(itemsNormalizados.map((item) => item.referencia)).size !== itemsNormalizados.length) {
      setErrorItems("No repitas el mismo lote en varias filas.");
      return;
    }

    setGuardandoItems(true);
    try {
      await actualizarItemsBoleta(id, itemsNormalizados);
      setEditandoItems(false);
      setMensajeItems("Ítems actualizados. La boleta conserva su número y sigue en BORRADOR.");
      await cargar();
    } catch (fallo) {
      setErrorItems(fallo?.message || "No se pudieron guardar los cambios.");
    } finally {
      setGuardandoItems(false);
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
    setMostrandoAnulacion(false);
    setMotivoAnulacion("");
    setAnulacionConfirmada(false);
    setMensajeAnulacion("");
    setErrorAnulacion("");
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
  const historial = Array.isArray(boleta.historial) ? boleta.historial : [];
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
              {puedeEmitir && boleta.estado === "BORRADOR" && !editandoItems && (
                <button
                  type="button"
                  className="ts-btn"
                  onClick={abrirEdicionItems}
                  disabled={cargandoLotes}
                  data-feature="ABC-78"
                >
                  {cargandoLotes ? "Cargando lotes…" : "Editar ítems"}
                </button>
              )}
              {puedeEmitir && !emitida && boleta.estado === "BORRADOR" && !editandoItems && (
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
              {emitida && (
                <button type="button" className="ts-btn ts-btn-primary" onClick={() => window.print()}>
                  Imprimir
                </button>
              )}
              {puedeEmitir && emitida && !mostrandoAnulacion && !anulacionConfirmada && (
                <button type="button" className="ts-btn" onClick={() => {
                  setErrorAnulacion("");
                  setMostrandoAnulacion(true);
                }}>
                  Anular boleta
                </button>
              )}
              {editandoItems && (
                <>
                  <button type="button" className="ts-btn" onClick={() => { setEditandoItems(false); setErrorItems(""); }} disabled={guardandoItems}>Cancelar edición</button>
                  <button type="button" className="ts-btn ts-btn-primary" onClick={guardarItems} disabled={guardandoItems}>
                    {guardandoItems ? "Guardando…" : "Guardar ítems"}
                  </button>
                </>
              )}
              <Link className="ts-btn" to="/logistica/boletas">Volver</Link>
            </div>
          }
        />

        {mensajeAnulacion && <p className="ts-feedback ts-notice" role="status">{mensajeAnulacion}</p>}
        {errorAnulacion && <p className="ts-feedback ts-error" role="alert">{errorAnulacion}</p>}
        {anulacionConfirmada && boleta.estado !== "ANULADA" && (
          <button type="button" className="ts-btn" disabled={anulando} onClick={async () => {
            try { await recargarBoletaAnulada(); }
            catch (fallo) { setErrorAnulacion(fallo?.message || "No se pudo actualizar el detalle."); }
          }}>Recargar detalle</button>
        )}
        {mostrandoAnulacion && puedeEmitir && emitida && (
          <form onSubmit={handleAnular} className="ts-card" aria-label="Anulación de boleta">
            <label htmlFor="motivo-anulacion">Motivo de anulación (obligatorio)</label>
            <textarea id="motivo-anulacion" required maxLength={500} value={motivoAnulacion}
              disabled={anulando} onChange={(evento) => setMotivoAnulacion(evento.target.value)} />
            <div className="ts-btn-group">
              <button type="submit" className="ts-btn ts-btn-primary" disabled={anulando}>
                {anulando ? "Anulando…" : "Confirmar anulación"}
              </button>
              <button type="button" className="ts-btn" disabled={anulando} onClick={() => {
                setMostrandoAnulacion(false);
                setMotivoAnulacion("");
                setErrorAnulacion("");
              }}>Cancelar anulación</button>
            </div>
          </form>
        )}

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

        {mensajeItems && (
          <div className="ts-feedback ts-notice" role="status" style={{ marginBottom: "1rem" }}>
            <p>{mensajeItems}</p>
          </div>
        )}

        {errorItems && (
          <div className="ts-feedback ts-error" role="alert" style={{ marginBottom: "1rem" }}>
            <p>{errorItems}</p>
          </div>
        )}

        {editandoItems && (
          <div className="boleta-edicion" aria-label="Editor de ítems de boleta">
            <h2>Editar ítems del borrador</h2>
            <p>Solo puedes editar esta boleta mientras está en BORRADOR. Los lotes disponibles pertenecen a la orden y a la solicitud de salida. La vista previa conservará los valores anteriores hasta que guardes.</p>
            {itemsBorrador.map((item, indice) => (
              <div className="boleta-edicion__fila" key={`${item.referencia}-${indice}`}>
                <label>
                  <span>Lote</span>
                  <select value={item.referencia} onChange={(evento) => cambiarItem(indice, "referencia", evento.target.value)}>
                    {!lotesDisponibles.includes(item.referencia) && <option value={item.referencia}>{item.referencia} (actual)</option>}
                    {lotesDisponibles.map((lote) => <option key={lote} value={lote}>{lote}</option>)}
                  </select>
                </label>
                <label>
                  <span>Cantidad</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.cantidad}
                    onChange={(evento) => cambiarItem(indice, "cantidad", evento.target.value)}
                    aria-label={`Cantidad del lote ${item.referencia}`}
                  />
                </label>
                <button type="button" className="ts-btn ts-btn--sm" onClick={() => setItemsBorrador((actuales) => actuales.filter((_, i) => i !== indice))} disabled={itemsBorrador.length <= 1}>
                  Quitar
                </button>
              </div>
            ))}
            <div className="boleta-edicion__agregar">
              <label>
                <span>Agregar lote de la solicitud</span>
                <select value={nuevoLote} onChange={(evento) => setNuevoLote(evento.target.value)}>
                  <option value="">Selecciona un lote</option>
                  {lotesDisponibles.filter((lote) => !itemsBorrador.some((item) => item.referencia === lote)).map((lote) => (
                    <option key={lote} value={lote}>{lote}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Cantidad</span>
                <input type="text" inputMode="decimal" value={cantidadNuevoLote} onChange={(evento) => setCantidadNuevoLote(evento.target.value)} />
              </label>
              <button type="button" className="ts-btn ts-btn--sm" onClick={agregarItem} disabled={!nuevoLote}>Agregar ítem</button>
            </div>
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

      <section className="boleta-pantalla" aria-labelledby="historial-boleta-titulo">
        <h2 id="historial-boleta-titulo">Historial de auditoría</h2>
        {historial.length === 0 ? <p>No hay cambios de estado registrados.</p> : (
          <table className="ts-table">
            <caption>Cambios de estado de la boleta</caption>
            <thead><tr>
              <th scope="col">Fecha y hora</th><th scope="col">Usuario que realizó el cambio</th>
              <th scope="col">Estado anterior</th><th scope="col">Estado nuevo</th><th scope="col">Motivo</th>
            </tr></thead>
            <tbody>{historial.map((entrada) => (
              <tr key={entrada.id}>
                <td>{fechaHoraTexto(entrada.fechaHora)}</td>
                <td>{responsableDe({ responsableUsuarioId: entrada.usuarioActorId }, usuario)}</td>
                <td>{entrada.estadoAnterior}</td><td>{entrada.estadoNuevo}</td><td>{entrada.motivo}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {!emitida && (
        <p className="boleta-no-imprimible">
          Boleta {boleta.numero} en estado {boleta.estado}: solo una boleta EMITIDA
          tiene formato de envío.
        </p>
      )}
    </section>
  );
}
