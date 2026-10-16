import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSesion } from "../context/SesionContext.jsx";
import {
  ESTADO_BOLETA_EMITIDA,
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
          <Link className="ts-btn" to="/logistica">Volver</Link>
        </div>
      </div>
    );
  }

  if (!boleta || !solicitud) return null;

  const emitida = boleta.estado === ESTADO_BOLETA_EMITIDA;
  const items = Array.isArray(boleta.items) ? boleta.items : [];
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
              {emitida && (
                <button type="button" className="ts-btn ts-btn-primary" onClick={() => window.print()}>
                  Imprimir
                </button>
              )}
              <Link className="ts-btn" to="/logistica">Volver</Link>
            </div>
          }
        />

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

      {!emitida && (
        <p className="boleta-no-imprimible">
          Boleta {boleta.numero} en estado {boleta.estado}: solo una boleta EMITIDA
          tiene formato de envío.
        </p>
      )}
    </section>
  );
}
