import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSesion } from "../../context/SesionContext.jsx";
import { tienePermiso } from "../../services/permisos.js";
import { crearBoleta, PERMISO_CONSULTAR_BOLETAS } from "../../services/boletasService.js";
import { obtenerOrden } from "../../services/ordenesService.js";
import { listarLotesOrden } from "../../services/lotesService.js";
import { mensajeErrorSalida } from "../../services/solicitudesSalidaFormulario.js";

const ESTADOS_PREPARACION = new Set(["EN_PRODUCCION", "FINALIZADA"]);
const PERMISOS = ["logistica.solicitudes.consultar", "ordenes.consultar", "logistica.boletas.gestionar"];

async function comprobarSolicitud(solicitud) {
  if (!Array.isArray(solicitud.items) || !solicitud.items.length) {
    throw new Error("La solicitud no tiene ítems ni lotes para preparar una boleta.");
  }
  const items = solicitud.items.map(({ referencia, cantidad }) => {
    if (typeof referencia !== "string" || !referencia.trim() || referencia.length > 160 ||
        typeof cantidad !== "string" || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(cantidad) || /^0(?:\.0{1,4})?$/.test(cantidad)) {
      throw new Error("La solicitud tiene referencias o cantidades inválidas; revisa sus ítems guardados.");
    }
    return { referencia, cantidad };
  });
  const orden = await obtenerOrden(solicitud.ordenId);
  if (String(orden?.id) !== String(solicitud.ordenId) || !orden.codigo?.trim()) {
    throw new Error("No se pudo verificar la orden asociada a la solicitud.");
  }
  if (!ESTADOS_PREPARACION.has(orden.estado)) {
    throw new Error(`La orden está ${orden.estado || "sin estado informado"}. Solo EN_PRODUCCION o FINALIZADA permiten preparar la salida.`);
  }
  if (!Number.isSafeInteger(Number(orden.producto_id)) || Number(orden.producto_id) < 1 ||
      !orden.producto || typeof orden.producto !== "object") {
    throw new Error("La orden no tiene un producto válido para preparar la salida.");
  }
  const lotes = await listarLotesOrden(orden.codigo);
  if (!Array.isArray(lotes) || lotes.some((lote) => String(lote.ordenId) !== String(orden.id) ||
      String(lote.productoId) !== String(orden.producto_id))) {
    throw new Error("No se pudieron verificar los lotes de la orden y su producto.");
  }
  const referencias = new Set(lotes.map((lote) => lote.codigo));
  if (items.some((item) => !referencias.has(item.referencia))) {
    throw new Error("La solicitud no tiene todos sus lotes válidos en la orden. No se puede crear el borrador.");
  }
  return items;
}

export default function CrearBoletaDesdeSolicitud({ solicitud }) {
  const { usuario } = useSesion();
  const navigate = useNavigate();
  const faltantes = PERMISOS.filter((permiso) => !tienePermiso(usuario, permiso));
  const autorizado = faltantes.length === 0;
  const [validacion, setValidacion] = useState({ cargando: true, motivo: "" });
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [creada, setCreada] = useState(null);
  const enviando = useRef(false);

  useEffect(() => {
    let vigente = true;
    if (!autorizado || creada) return;
    setError("");
    setValidacion({ cargando: true, motivo: "" });
    comprobarSolicitud(solicitud).then(() => {
      if (vigente) setValidacion({ cargando: false, motivo: "" });
    }).catch((fallo) => {
      if (vigente) setValidacion({ cargando: false, motivo: mensajeErrorSalida(fallo, "ordenes.consultar") });
    });
    return () => { vigente = false; };
  }, [solicitud, autorizado, intento, creada]);

  async function crearBorrador() {
    if (enviando.current || creada || !autorizado || validacion.cargando || validacion.motivo) return;
    enviando.current = true;
    setGuardando(true);
    setError("");
    let confirmada = false;
    let verificada = false;
    try {
      // Revalida antes del POST por si la orden o sus lotes cambiaron desde la lectura.
      const items = await comprobarSolicitud(solicitud);
      verificada = true;
      const boleta = await crearBoleta(solicitud.id, items);
      confirmada = true;
      setCreada(boleta);
      if (tienePermiso(usuario, PERMISO_CONSULTAR_BOLETAS)) {
        navigate(`/logistica/boletas/${boleta.id}`, { state: { mensajeInicial: "Boleta creada en BORRADOR y guardada en el servidor." } });
      }
    } catch (fallo) {
      const mensaje = mensajeErrorSalida(fallo, verificada ? "logistica.boletas.gestionar" : "ordenes.consultar");
      if (!verificada) setValidacion({ cargando: false, motivo: mensaje });
      setError(mensaje);
    } finally {
      setGuardando(false);
      if (!confirmada) enviando.current = false;
    }
  }

  const motivo = !autorizado ? `Permisos necesarios: ${faltantes.join(", ")}.` : validacion.motivo;
  return (
    <div className="solicitudes-salida__accion">
      {creada ? <p role="status">Boleta #{creada.id} guardada. Estado: {creada.estado}.
        {tienePermiso(usuario, PERMISO_CONSULTAR_BOLETAS) && <Link to={`/logistica/boletas/${creada.id}`}>Ver detalle</Link>}
      </p> : <>
        <button type="button" className="ts-btn ts-btn-primary" onClick={crearBorrador}
          disabled={!autorizado || validacion.cargando || Boolean(motivo) || guardando}>
          {guardando ? "Creando borrador…" : "Crear boleta en borrador"}
        </button>
        {autorizado && validacion.cargando && <p role="status">Verificando orden y lotes…</p>}
        {motivo && motivo !== error && <p>{motivo}</p>}
        {autorizado && validacion.motivo && <button type="button" className="ts-btn" disabled={guardando}
          onClick={() => setIntento((actual) => actual + 1)}>Reintentar validación</button>}
      </>}
      {error && <p className="ts-error" role="alert">{error}</p>}
    </div>
  );
}
