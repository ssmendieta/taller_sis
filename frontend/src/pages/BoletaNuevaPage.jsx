import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader.jsx";
import { crearBoleta, listarSolicitudesSalida } from "../services/boletasService.js";
import { obtenerOrden } from "../services/ordenesService.js";
import { listarLotesOrden } from "../services/lotesService.js";
import { FORMATO_TITULO } from "../constants/marca.js";
import { useSesion } from "../context/SesionContext.jsx";
import { tienePermiso } from "../services/permisos.js";
import { mensajeErrorSalida } from "../services/solicitudesSalidaFormulario.js";

function textoError(error) {
  return mensajeErrorSalida(error);
}

export default function BoletaNuevaPage() {
  const { usuario } = useSesion();
  const permisosNecesarios = ['logistica.solicitudes.consultar', 'ordenes.consultar', 'logistica.boletas.gestionar'];
  const faltantes = permisosNecesarios.filter((permiso) => !tienePermiso(usuario, permiso));
  const autorizado = faltantes.length === 0;
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState([]);
  const [solicitudId, setSolicitudId] = useState("");
  const [lotes, setLotes] = useState([]);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const solicitud = solicitudes.find((item) => String(item.id) === solicitudId);
  const referenciasSolicitadas = useMemo(
    () => new Map((solicitud?.items ?? []).map((item) => [String(item.referencia).trim(), item])),
    [solicitud],
  );
  const lotesElegibles = lotes.filter((lote) => referenciasSolicitadas.has(String(lote.codigo).trim()));

  useEffect(() => {
    document.title = FORMATO_TITULO("Crear boleta");
    let activo = true;
    if (!autorizado) { setCargando(false); return; }
    setCargando(true);
    listarSolicitudesSalida()
      .then((respuesta) => {
        if (!Array.isArray(respuesta)) throw new Error("El servidor no devolvió un listado válido de solicitudes.");
        if (activo) setSolicitudes(respuesta);
      })
      .catch((fallo) => { if (activo) setError(textoError(fallo)); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [autorizado]);

  function seleccionarSolicitud(id) {
    setSolicitudId(id);
    setLotes([]);
    setItems([]);
    setError("");
    setCargandoLotes(Boolean(id));
  }

  useEffect(() => {
    if (!solicitud || !autorizado) return;
    let vigente = true;
    setCargandoLotes(true);
    async function cargarLotes() {
    try {
      const orden = await obtenerOrden(solicitud.ordenId);
      const codigoOrden = String(orden.codigo ?? orden.codigo_orden ?? "").trim();
      if (!codigoOrden) throw new Error("No se pudo leer el código de la orden asociada a la solicitud.");
      const respuestaLotes = await listarLotesOrden(codigoOrden);
      const solicitudRefs = new Set((solicitud.items ?? []).map((item) => String(item.referencia).trim()));
      const validos = (Array.isArray(respuestaLotes) ? respuestaLotes : [])
        .filter((lote) => String(lote.ordenId) === String(solicitud.ordenId) && solicitudRefs.has(String(lote.codigo).trim()));
      if (!vigente) return;
      setLotes(validos);
      setItems(validos.map((lote) => {
        const solicitado = (solicitud.items ?? []).find((item) => String(item.referencia).trim() === String(lote.codigo).trim());
        return { referencia: String(lote.codigo), cantidad: String(solicitado.cantidad), incluido: true };
      }));
      if (!validos.length) setError("La solicitud no tiene lotes de producción válidos para crear la boleta.");
    } catch (fallo) {
      if (vigente) setError(textoError(fallo));
    } finally {
      if (vigente) setCargandoLotes(false);
    }
    }
    cargarLotes();
    return () => { vigente = false; };
  }, [solicitud, autorizado]);

  function cambiarItem(referencia, campo, valor) {
    setItems((actuales) => actuales.map((item) => item.referencia === referencia ? { ...item, [campo]: valor } : item));
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (guardando || cargandoLotes || !autorizado) return;
    setError("");
    const seleccionados = items.filter((item) => item.incluido);
    if (!solicitudId) return setError("Selecciona una solicitud de salida.");
    if (!seleccionados.length) return setError("Incluye al menos un lote en la boleta.");
    if (seleccionados.some((item) => !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(item.cantidad) || Number(item.cantidad) <= 0)) {
      return setError("Cada cantidad debe ser positiva y puede usar hasta cuatro decimales.");
    }
    setGuardando(true);
    try {
      const boleta = await crearBoleta(solicitudId, seleccionados.map(({ referencia, cantidad }) => ({ referencia, cantidad })));
      navigate(`/logistica/boletas/${boleta.id}`, { replace: true, state: { mensajeInicial: "Boleta creada en BORRADOR y guardada en el servidor." } });
    } catch (fallo) {
      setError(textoError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="ts-page" aria-labelledby="boleta-nueva-titulo">
      <PageHeader titulo="Crear boleta de envío" descripcion="Crea una boleta real en el servidor a partir de una solicitud y sus lotes válidos." accion={<Link className="ts-btn" to="/logistica/boletas">Volver a boletas</Link>} />
      {error && <div className="ts-feedback ts-error" role="alert"><p>{error}</p></div>}
      {!autorizado ? <p role="alert">Permisos necesarios para crear una boleta desde una solicitud: {faltantes.join(', ')}.</p>
        : cargando ? <p className="ts-feedback" role="status">Cargando solicitudes…</p> : (
        <form className="ts-panel" onSubmit={guardar}>
          <div className="ts-panel-title"><div><h2 id="boleta-nueva-titulo">Nueva boleta en borrador</h2><p>Se guarda en la base del sistema; no usa datos de demostración ni almacenamiento local.</p></div><strong>BORRADOR</strong></div>
          <div className="ts-section">
            <label className="ts-field" htmlFor="solicitud-salida">Solicitud de salida
              <select id="solicitud-salida" value={solicitudId} onChange={(evento) => seleccionarSolicitud(evento.target.value)} required>
                <option value="">Selecciona una solicitud</option>
                {solicitudes.map((item) => <option key={item.id} value={item.id}>Solicitud #{item.id} · Orden #{item.ordenId} · {item.estado}</option>)}
              </select>
            </label>
            <Link className="ts-btn" to="/logistica/inicio">Registrar o consultar solicitudes de salida</Link>
            {solicitudes.length === 0 && <p className="ts-empty">No hay solicitudes de salida registradas. Primero registra una solicitud de salida.</p>}
          </div>
          {solicitud && <div className="ts-section">
            <h3>Lotes solicitados</h3>
            {cargandoLotes ? <p role="status">Consultando los lotes de la orden…</p> : lotesElegibles.length === 0 ? <p className="ts-empty">No hay lotes de esta orden incluidos en la solicitud.</p> : (
              <div className="ts-table-wrap" style={{ margin: 0 }}><table className="ts-table" style={{ minWidth: 0 }}>
                <thead><tr><th scope="col">Incluir</th><th scope="col">Lote</th><th scope="col">Cantidad solicitada</th><th scope="col">Cantidad en boleta</th></tr></thead>
                <tbody>{items.map((item) => <tr key={item.referencia}>
                  <td><input aria-label={`Incluir lote ${item.referencia}`} type="checkbox" checked={item.incluido} onChange={(evento) => cambiarItem(item.referencia, "incluido", evento.target.checked)} /></td>
                  <td>{item.referencia}</td>
                  <td>{referenciasSolicitadas.get(item.referencia)?.cantidad ?? "—"}</td>
                  <td><input aria-label={`Cantidad para lote ${item.referencia}`} type="number" min="0.0001" step="0.0001" value={item.cantidad} onChange={(evento) => cambiarItem(item.referencia, "cantidad", evento.target.value)} disabled={!item.incluido} /></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </div>}
          <div className="ts-section ts-btn-group ts-btn-group--end">
            <button className="ts-btn ts-btn-primary" type="submit" disabled={guardando || cargandoLotes || !solicitudes.length}>{guardando ? "Guardando…" : "Crear boleta en borrador"}</button>
          </div>
        </form>
      )}
    </section>
  );
}
